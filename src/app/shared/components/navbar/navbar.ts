import { ChangeDetectionStrategy, Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ShoppingCart } from '../../../features/shopping-cart/shopping-cart';
import { AuthService } from '../../../core/services/auth.service';
import type { AuthUser } from '../../../core/models/auth.models';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ShoppingCart],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navbar implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  currentUser: AuthUser | null = null;

  ngOnInit(): void {
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
  }
 goToUserArea(): void {
    const target = this.currentUser ? '/user-profile' : '/login';
    void this.router.navigateByUrl(target);
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        void this.router.navigateByUrl('/login');
      },
      error: () => {
        console.error('No se pudo cerrar la sesión');
      },
    });
  }
}
