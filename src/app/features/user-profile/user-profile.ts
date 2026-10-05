import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService, UpdateProfileRequest } from '../../core/services/auth.service';

import { FormUtils } from '../../shared/utils/form-utils';

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

  readonly profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.minLength(9)]],
    address: [''],
    city: [''],
    postalCode: ['', [Validators.pattern(/^\d{5}$/)]],
  });

  submitted = false;

  ngOnInit(): void {
  this.authService.getCurrentUser().subscribe({
    next: (response) => {
      this.profileForm.patchValue({
        fullName: response.user.full_name,
        email: response.user.email,
        phone: response.user.phone,
        address: response.user.address ?? '',
        city: response.user.city ?? '',
        postalCode: response.user.postal_code ?? '',
      });
    },
    error: (error: HttpErrorResponse) => {
      if (error.status === 401) {
        void this.router.navigateByUrl('/login');
        return;
      }

      console.error('No se pudo cargar el perfil:', error.message);
    },
  });
}

  onSubmit(): void {
    this.submitted = true;

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const payload: UpdateProfileRequest = this.profileForm.getRawValue();

    this.authService.updateCurrentUser(payload).subscribe({
      next: (response) => {
        console.log(response.message);
        this.profileForm.patchValue({
          fullName: response.user.full_name,
          email: response.user.email,
          phone: response.user.phone,
          address: response.user.address ?? '',
          city: response.user.city ?? '',
          postalCode: response.user.postal_code ?? '',
        });
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          void this.router.navigateByUrl('/login');
          return;
        }

        console.error(
          'No se pudo actualizar el perfil:',
          error.error?.message ?? error.message
        );
      },
    });
  }
}
