import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Franja de confianza: solo hechos verificables (sin plazos, cifras, reseñas ni testimonios)
@Component({
  selector: 'app-trust-strip',
  imports: [RouterLink],
  standalone: true,
  templateUrl: './trust-strip.html',
  styleUrl: './trust-strip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrustStrip {}
