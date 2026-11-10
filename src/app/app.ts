import { Component } from '@angular/core';
import { Login } from './components/login/login';

@Component({
  imports: [Login],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App { }
