import { computed, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private readonly activeTasks = signal(0);
  readonly isLoading = computed(() => this.activeTasks() > 0);

  async track<T>(operation: () => Promise<T>): Promise<T> {
    this.activeTasks.update((count) => count + 1);
    try {
      return await operation();
    } finally {
      this.activeTasks.update((count) => count - 1);
    }
  }
}
