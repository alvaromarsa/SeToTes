import {
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { SessionNoticeService } from '@core/services/session-notice.service';
import type { AuthUser, UpdateProfileRequest } from '@core/models/auth.models';
import { getErrorMessage } from '@core/utils/http-error-message';
import { loginUrlTree } from '@core/utils/return-url';

import { FormUtils } from '@shared/utils/form-utils';
import { focusAfterRender } from '@shared/utils/focus-after-render';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfile implements OnInit {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly sessionNoticeService = inject(SessionNoticeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly submitButton = viewChild.required<ElementRef<HTMLButtonElement>>('submitButton');

  readonly profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.minLength(9)]],
    address: [''],
    city: [''],
    postalCode: ['', [Validators.pattern(/^\d{5}$/)]],
  });

  submitted = false;
  isSubmitting = false;
  // Aviso de bienvenida tras registrarse o confirmación al guardar
  successMessage = '';
  errorMessage = '';

  ngOnInit(): void {
    this.sessionNoticeService.notice$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notice) => {
        if (notice?.kind === 'success') {
          this.successMessage = notice.message;
          this.cdr.markForCheck();
        }
      });

    // La bienvenida es para esta visita: al salir del perfil no debe reaparecer
    this.destroyRef.onDestroy(() => this.sessionNoticeService.clear('success'));

    this.authService.getCurrentUser().subscribe({
      next: (response) => {
        this.fillForm(response.user);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          void this.router.navigateByUrl(loginUrlTree(this.router, '/user-profile'));
          return;
        }

        console.error('No se pudo cargar el perfil:', error.status, error);
        this.errorMessage = getErrorMessage(error, 'No se pudieron cargar tus datos. Recarga la página.');
        this.cdr.markForCheck();
      },
    });
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    this.submitted = true;
    this.successMessage = '';
    this.errorMessage = '';
    this.sessionNoticeService.clear('success');

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const payload: UpdateProfileRequest = this.profileForm.getRawValue();
    this.isSubmitting = true;

    this.authService.updateCurrentUser(payload).subscribe({
      next: (response) => {
        this.fillForm(response.user);
        this.successMessage = 'Tus datos se han guardado correctamente.';
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;

        if (error.status === 401) {
          void this.router.navigateByUrl(loginUrlTree(this.router, '/user-profile'));
          return;
        }

        console.error('No se pudo actualizar el perfil:', error.status, error);
        // 409: "Ya existe una cuenta con ese email"
        this.errorMessage = getErrorMessage(error, 'No se pudieron guardar tus datos. Inténtalo de nuevo.');
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.submitButton().nativeElement);
      },
    });
  }

  private fillForm(user: AuthUser): void {
    this.profileForm.patchValue({
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address ?? '',
      city: user.city ?? '',
      postalCode: user.postal_code ?? '',
    });
  }
}
