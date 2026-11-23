import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injector,
  OnInit,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { filter } from 'rxjs';

import { ShoppingCart } from '@features/shopping-cart/shopping-cart';
import { AuthService } from '@core/services/auth.service';
import { categoryPath } from '@core/config/categories.config';
import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import type { AuthUser } from '@core/models/auth.models';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ShoppingCart],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Navbar implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  private readonly userMenu = viewChild.required<ElementRef<HTMLElement>>('userMenu');
  private readonly userMenuButton = viewChild.required<ElementRef<HTMLButtonElement>>('userMenuButton');
  private readonly menuItems = viewChildren<ElementRef<HTMLElement>>('menuItem');

  private readonly categoryService = inject(CategoryService);

  // Categorías de la BD (signal del servicio, cargado una vez). Mientras cargan, o si fallan,
  // la fila queda vacía pero conserva su altura (min-height en navbar.css): nada salta
  readonly categories = this.categoryService.categories;
  readonly categoryPath = categoryPath;

  currentUser: AuthUser | null = null;
  isUserMenuOpen = false;
  logoutError = '';

  ngOnInit(): void {
    this.categoryService.load();

    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
      this.cdr.markForCheck();
    });
    this.authService.getCurrentUser().subscribe({
      error: (error: HttpErrorResponse) => {
        if (error.status !== 401) {
          console.error('No se pudo recuperar la sesión:', error.message);
        }
      },
    });
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeUserMenu();
        this.cdr.markForCheck();
      });
  }

  toggleUserMenu(): void {
    if (this.isUserMenuOpen) {
      this.closeUserMenu();
    } else {
      this.openUserMenu('first');
    }
  }

  closeUserMenu(returnFocus = false): void {
    this.isUserMenuOpen = false;

    if (returnFocus) {
      this.userMenuButton().nativeElement.focus();
    }
  }

  // Patrón "menu button" de WAI-ARIA: flechas abren el menú desde el botón
  onUserMenuButtonKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openUserMenu(event.key === 'ArrowDown' ? 'first' : 'last');
    } else if (event.key === 'Escape' && this.isUserMenuOpen) {
      this.closeUserMenu(true);
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems().map((item) => item.nativeElement);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const lastIndex = items.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[currentIndex >= lastIndex ? 0 : currentIndex + 1]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[currentIndex <= 0 ? lastIndex : currentIndex - 1]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[lastIndex]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        this.closeUserMenu(true);
        break;
      case 'Tab':
        // El foco sigue su orden natural; el menú no debe quedarse abierto detrás
        this.closeUserMenu();
        break;
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isUserMenuOpen && !this.userMenu().nativeElement.contains(event.target as Node)) {
      this.closeUserMenu();
    }
  }

  logout(): void {
    this.closeUserMenu();
    this.logoutError = '';

    this.authService.logout().subscribe({
      next: () => {
        void this.router.navigateByUrl('/login');
      },
      error: (error: unknown) => {
        console.error('No se pudo cerrar la sesión', error);
        this.logoutError = getErrorMessage(error, 'No se pudo cerrar la sesión. Inténtalo de nuevo.');
        this.cdr.markForCheck();
      },
    });
  }

  dismissLogoutError(): void {
    this.logoutError = '';
  }

  private openUserMenu(focusTarget: 'first' | 'last'): void {
    this.isUserMenuOpen = true;

    // Los elementos del menú solo existen tras el siguiente render
    afterNextRender(
      () => {
        const items = this.menuItems();
        items[focusTarget === 'first' ? 0 : items.length - 1]?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}
