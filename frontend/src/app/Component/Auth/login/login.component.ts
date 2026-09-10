import { Component } from "@angular/core";
import {CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';

@Component({
  imports: [CdkDropList, CdkDrag],
  selector: "app-login",
  styleUrl: "./login.component.css",
  templateUrl: "./login.component.html",
})
export class LoginComponent {
    items = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
      drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.items, event.previousIndex, event.currentIndex);
      }
}
