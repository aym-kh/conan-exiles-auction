import { Component, Input } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-title',
  styleUrl: './title.css',
  templateUrl: './title.html',
})
export class Title {
  @Input() content: any;
}
