import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AnnouncementBar } from './shared/components/announcement-bar/announcement-bar';
import { Footer } from './shared/components/footer/footer';
import { Navbar } from './shared/components/navbar/navbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AnnouncementBar, Navbar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('SeToTes');
}
