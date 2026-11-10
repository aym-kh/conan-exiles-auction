import { Component, Input } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-server-plate',
  styleUrl: './server-plate.css',
  templateUrl: './server-plate.html',
})
export class ServerPlate {
  @Input() image: string = "";
  @Input() title: string = "";
  @Input() isOwner: boolean = false
}
