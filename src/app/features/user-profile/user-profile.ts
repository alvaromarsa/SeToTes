import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfile {
  private readonly fb = inject(FormBuilder);

  readonly profileForm = this.fb.nonNullable.group({
    fullName: ['María López', [Validators.required, Validators.minLength(2)]],
    email: ['maria@totebag.com', [Validators.required, Validators.email]],
    phone: ['+34 612 345 678', [Validators.required, Validators.minLength(9)]],
    address: ['Calle Mayor 24, 2ºA', [Validators.required]],
    city: ['Madrid', [Validators.required]],
    postalCode: ['28001', [Validators.required, Validators.pattern(/^\d{5}$/)]],
  });

  submitted = false;

  onSubmit(): void {
    this.submitted = true;

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const payload = this.profileForm.getRawValue();
    console.log('Profile update:', payload);
  }

  hasError(fieldName: string, errorName: string): boolean {
    const control = this.profileForm.get(fieldName);
    return !!(control && control.touched && control.hasError(errorName));
  }
}
