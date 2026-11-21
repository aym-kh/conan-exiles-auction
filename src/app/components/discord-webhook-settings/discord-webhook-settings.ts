import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { DiscordNotifications } from '../../services/discord-notifications';

@Component({
  selector: 'app-discord-webhook-settings',
  templateUrl: './discord-webhook-settings.html',
})
export class DiscordWebhookSettings implements OnInit {
  private readonly notifications = inject(DiscordNotifications);
  @Input({ required: true }) discordGuildId!: string;

  protected readonly isLoading = signal(true);
  protected readonly isBusy = signal(false);
  protected readonly canConfigure = signal(false);
  protected readonly isConfigured = signal(false);
  protected readonly webhookUrl = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly statusMessage = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.isConfigured.set(await this.notifications.getWebhookStatus(this.discordGuildId));
      this.canConfigure.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load Discord notification settings.';
      this.errorMessage.set(message);
      this.canConfigure.set(!message.includes('Only the Discord server owner'));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onWebhookUrlInput(event: Event) {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.webhookUrl.set(target.value);
    }
  }

  protected async saveWebhook() {
    const webhookUrl = this.webhookUrl().trim();
    if (!webhookUrl || this.isBusy()) {
      return;
    }

    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);
    try {
      await this.notifications.saveWebhook(this.discordGuildId, webhookUrl);
      this.isConfigured.set(true);
      this.webhookUrl.set('');
      this.statusMessage.set('Test message sent. Discord notifications are connected.');
    } catch (error) {
      console.error(`Failed to configure Discord notifications for server ${this.discordGuildId}:`, error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not save this Discord webhook.');
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async removeWebhook() {
    if (this.isBusy() || !this.isConfigured()) {
      return;
    }

    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);
    try {
      await this.notifications.removeWebhook(this.discordGuildId);
      this.isConfigured.set(false);
      this.statusMessage.set('Discord notifications have been disabled.');
    } catch (error) {
      console.error(`Failed to remove Discord notifications for server ${this.discordGuildId}:`, error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not disable Discord notifications.');
    } finally {
      this.isBusy.set(false);
    }
  }
}
