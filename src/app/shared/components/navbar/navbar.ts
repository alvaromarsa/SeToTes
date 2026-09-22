import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ShoppingCart } from '../../../features/shopping-cart/shopping-cart';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ShoppingCart],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navbar {
  private readonly router = inject(Router);

  goToUserArea(): void {
    const isLoggedIn = this.isUserLoggedIn();
    const target = isLoggedIn ? '/user-profile' : '/login';

    void this.router.navigateByUrl(target);
  }

  private isUserLoggedIn(): boolean {
    const rawSession = localStorage.getItem('totebag_session');

    if (!rawSession) {
      return false;
    }

    try {
      const session = JSON.parse(rawSession) as { loggedIn?: boolean; user?: unknown; token?: string };
      return Boolean(session.loggedIn || session.user || session.token);
    } catch {
      return false;
    }
  }
}
