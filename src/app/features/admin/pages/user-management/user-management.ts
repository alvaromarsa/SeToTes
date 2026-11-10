import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  type Observable,
  of,
  Subject,
  switchMap,
} from 'rxjs';

import {
  type AdminUser,
  type AdminUserPage,
  USER_ROLE_LABELS,
  USER_ROLES,
  USER_STATUS_LABELS,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
} from '@core/models/admin-user.models';
import { AdminUserService } from '@core/services/admin-user.service';
import { AuthService } from '@core/services/auth.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { ConfirmDialog } from '@shared/components/confirm-dialog/confirm-dialog';

type UserActionType = 'block' | 'unblock' | 'make-admin' | 'make-customer' | 'delete';

interface PendingAction {
  type: UserActionType;
  user: AdminUser;
  origin: HTMLElement | null;
}

type LoadResult = { ok: true; page: AdminUserPage } | { ok: false };

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const ACTION_ERROR_FALLBACK = 'No se pudo completar la acción. Inténtalo de nuevo.';

@Component({
  selector: 'app-user-management',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, ConfirmDialog],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagement implements OnInit {
  private readonly adminUserService = inject(AdminUserService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder);

  private readonly confirmDialog = viewChild.required(ConfirmDialog);
  private readonly listHeading = viewChild.required<ElementRef<HTMLElement>>('listHeading');

  // silent: recarga tras una acción, sin sustituir la lista por "Cargando…"
  private readonly loadRequests = new Subject<{ silent: boolean }>();

  readonly roles = USER_ROLES;
  readonly roleLabels = USER_ROLE_LABELS;
  readonly statuses = USER_STATUSES;
  readonly statusLabels = USER_STATUS_LABELS;

  readonly filtersForm = this.fb.nonNullable.group({
    search: '',
    role: '' as UserRole | '',
    status: '' as UserStatus | '',
  });

  page = 1;
  userPage: AdminUserPage | null = null;
  isLoading = true;
  loadError = false;
  currentUserId: number | null = null;
  busyUserIds = new Set<number>();
  statusMessage = '';
  actionError = '';
  pendingAction: PendingAction | null = null;

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.currentUserId = user?.id ?? null;
        this.cdr.markForCheck();
      });

    const { search, role, status } = this.filtersForm.controls;

    // La búsqueda espera a que se deje de escribir; los selectores se aplican al momento
    const searchChanges$ = search.valueChanges.pipe(
      map((value) => value.trim()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    );

    merge(searchChanges$, role.valueChanges, status.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page = 1;
        this.load();
      });

    // switchMap: una petición nueva cancela la anterior (filtros cambiados muy deprisa)
    this.loadRequests
      .pipe(
        switchMap(({ silent }) => {
          if (!silent) {
            this.isLoading = true;
            this.loadError = false;
            this.cdr.markForCheck();
          }

          return this.fetchPage();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.onPageLoaded(result));

    this.load();
  }

  get totalPages(): number {
    return this.userPage ? Math.max(1, Math.ceil(this.userPage.total / this.userPage.pageSize)) : 1;
  }

  get dialogTitle(): string {
    const action = this.pendingAction;
    if (!action) {
      return '';
    }

    const name = action.user.fullName;
    return {
      block: `¿Bloquear a ${name}?`,
      unblock: `¿Desbloquear a ${name}?`,
      'make-admin': `¿Hacer administrador a ${name}?`,
      'make-customer': `¿Quitar el rol de administrador a ${name}?`,
      delete: `¿Eliminar la cuenta de ${name}?`,
    }[action.type];
  }

  get dialogMessage(): string {
    return this.pendingAction
      ? {
          block:
            'Este usuario no podrá iniciar sesión ni comprar hasta que lo desbloquees. Si ahora tiene la sesión abierta, se cerrará en su próxima acción.',
          unblock: 'Podrá volver a iniciar sesión y comprar con normalidad.',
          'make-admin':
            'Tendrá acceso completo al panel de administración: productos, pedidos y usuarios.',
          'make-customer': 'Dejará de tener acceso al panel de administración y pasará a ser cliente.',
          delete: 'Se borrarán su cuenta y su carrito. Esta acción no se puede deshacer.',
        }[this.pendingAction.type]
      : '';
  }

  get dialogConfirmLabel(): string {
    return this.pendingAction
      ? {
          block: 'Bloquear',
          unblock: 'Desbloquear',
          'make-admin': 'Hacer administrador',
          'make-customer': 'Hacer cliente',
          delete: 'Eliminar',
        }[this.pendingAction.type]
      : 'Confirmar';
  }

  get isDialogDanger(): boolean {
    return this.pendingAction?.type !== 'unblock' && this.pendingAction?.type !== 'make-customer';
  }

  isSelf(user: AdminUser): boolean {
    return user.id === this.currentUserId;
  }

  isBusy(user: AdminUser): boolean {
    return this.busyUserIds.has(user.id);
  }

  retry(): void {
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page) {
      return;
    }

    this.page = page;
    this.load();
  }

  askAction(type: UserActionType, user: AdminUser, event: Event): void {
    this.statusMessage = '';
    this.actionError = '';
    this.pendingAction = { type, user, origin: event.currentTarget as HTMLElement | null };
    this.cdr.markForCheck();

    // El título y el texto del diálogo deben estar pintados antes de abrirlo
    afterNextRender(() => this.confirmDialog().open(this.pendingAction?.origin), {
      injector: this.injector,
    });
  }

  onDialogCancelled(): void {
    this.pendingAction = null;
  }

  onDialogConfirmed(): void {
    const action = this.pendingAction;
    this.pendingAction = null;

    if (!action) {
      return;
    }

    const { type, user } = action;
    this.busyUserIds = new Set(this.busyUserIds).add(user.id);

    this.runAction(type, user).subscribe({
      next: () => {
        this.statusMessage = this.successMessage(type, user);
        this.finishAction(user);
        // El usuario eliminado desaparece de la lista: el foco va al título del listado
        this.restoreFocus(type === 'delete' ? null : action.origin);
        this.load({ silent: true });
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo completar la acción sobre el usuario:', error);
        // 409: por ejemplo, la tienda se quedaría sin ningún administrador activo
        this.actionError = getErrorMessage(error, ACTION_ERROR_FALLBACK);
        this.finishAction(user);
        this.restoreFocus(action.origin);
      },
    });
  }

  private runAction(type: UserActionType, user: AdminUser): Observable<unknown> {
    switch (type) {
      case 'block':
        return this.adminUserService.setBlocked(user.id, true);
      case 'unblock':
        return this.adminUserService.setBlocked(user.id, false);
      case 'make-admin':
        return this.adminUserService.setRole(user.id, 'admin');
      case 'make-customer':
        return this.adminUserService.setRole(user.id, 'customer');
      case 'delete':
        return this.adminUserService.remove(user.id);
    }
  }

  private successMessage(type: UserActionType, user: AdminUser): string {
    const name = user.fullName;
    return {
      block: `Se ha bloqueado a ${name}.`,
      unblock: `Se ha desbloqueado a ${name}.`,
      'make-admin': `Ahora ${name} tiene el rol de administrador.`,
      'make-customer': `Ahora ${name} tiene el rol de cliente.`,
      delete: `Se ha eliminado la cuenta de ${name}.`,
    }[type];
  }

  private finishAction(user: AdminUser): void {
    const busy = new Set(this.busyUserIds);
    busy.delete(user.id);
    this.busyUserIds = busy;
    this.cdr.markForCheck();
  }

  // El botón estuvo desactivado durante la petición y perdió el foco: se le devuelve
  private restoreFocus(origin: HTMLElement | null): void {
    afterNextRender(
      () => {
        if (origin?.isConnected && !(origin as HTMLButtonElement).disabled) {
          origin.focus();
        } else {
          this.listHeading().nativeElement.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private load(options: { silent: boolean } = { silent: false }): void {
    this.loadRequests.next(options);
  }

  private fetchPage(): Observable<LoadResult> {
    const { search, role, status } = this.filtersForm.getRawValue();

    return this.adminUserService
      .list({
        search,
        role: role || undefined,
        status: status || undefined,
        page: this.page,
        pageSize: PAGE_SIZE,
      })
      .pipe(
        map((page): LoadResult => ({ ok: true, page })),
        catchError((error: unknown) => {
          console.error('No se pudieron cargar los usuarios:', error);
          return of<LoadResult>({ ok: false });
        }),
      );
  }

  private onPageLoaded(result: LoadResult): void {
    if (!result.ok) {
      this.isLoading = false;
      this.loadError = true;
      this.cdr.markForCheck();
      return;
    }

    // Página vacía que no es la primera (por ejemplo, tras eliminar al último de la página)
    if (result.page.items.length === 0 && this.page > 1 && result.page.total > 0) {
      this.page = Math.max(1, Math.ceil(result.page.total / result.page.pageSize));
      this.load({ silent: true });
      return;
    }

    this.userPage = result.page;
    this.isLoading = false;
    this.loadError = false;
    this.cdr.markForCheck();
  }
}
