import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';

interface IWebhookConfigResponse {
    configured: boolean;
}

interface INotificationDispatchResponse {
    sent: number;
    retrying: number;
    failed: number;
    skipped: number;
    pending: number;
}

type TNotificationEventType = 'auction_created' | 'bid_placed';

interface INotificationDispatchOptions {
    auctionId?: string;
    eventType?: TNotificationEventType;
    bidId?: string;
}

@Injectable({ providedIn: 'root' })
export class DiscordNotifications {
    private readonly supabaseService = inject(SupabaseService);

    async dispatchPendingNotifications(
        options: INotificationDispatchOptions = {},
    ): Promise<INotificationDispatchResponse> {
        const { data: { session }, error: sessionError } =
            await this.supabaseService.client.auth.getSession();
        if (sessionError) {
            throw sessionError;
        }
        if (!session?.provider_token) {
            throw new Error('Your Discord session has expired. Sign in again to send auction notifications.');
        }

        const { data, error } = await this.supabaseService.client.functions.invoke<INotificationDispatchResponse>(
            'dispatch-discord-notifications',
            {
                body: {
                    providerToken: session.provider_token,
                    ...options,
                },
            },
        );
        if (error) {
            if ('context' in error && error.context instanceof Response) {
                const body: unknown = await error.context.clone().json().catch(() => null);
                if (
                    typeof body === 'object'
                    && body !== null
                    && 'error' in body
                    && typeof body.error === 'string'
                ) {
                    throw new Error(body.error);
                }
            }
            throw error;
        }
        if (
            !data
            || !Number.isInteger(data.sent)
            || !Number.isInteger(data.retrying)
            || !Number.isInteger(data.failed)
            || !Number.isInteger(data.skipped)
            || !Number.isInteger(data.pending)
        ) {
            throw new Error('The Discord notification response was invalid.');
        }
        return data;
    }

    async getWebhookStatus(discordGuildId: string): Promise<boolean> {
        return this.invoke('status', discordGuildId);
    }

    async saveWebhook(discordGuildId: string, webhookUrl: string): Promise<void> {
        await this.invoke('save', discordGuildId, webhookUrl);
    }

    async removeWebhook(discordGuildId: string): Promise<void> {
        await this.invoke('delete', discordGuildId);
    }

    private async invoke(
        action: 'status' | 'save' | 'delete',
        discordGuildId: string,
        webhookUrl?: string,
    ): Promise<boolean> {
        const { data: { session }, error: sessionError } =
            await this.supabaseService.client.auth.getSession();
        if (sessionError) {
            throw sessionError;
        }
        if (!session?.provider_token) {
            throw new Error('Your Discord session has expired. Sign in again to manage notifications.');
        }

        const { data, error } = await this.supabaseService.client.functions.invoke<IWebhookConfigResponse>(
            'discord-webhook-config',
            {
                body: {
                    action,
                    discordGuildId,
                    providerToken: session.provider_token,
                    ...(webhookUrl !== undefined ? { webhookUrl } : {}),
                },
            },
        );
        if (error) {
            if ('context' in error && error.context instanceof Response) {
                const body: unknown = await error.context.clone().json().catch(() => null);
                if (
                    typeof body === 'object'
                    && body !== null
                    && 'error' in body
                    && typeof body.error === 'string'
                ) {
                    throw new Error(body.error);
                }
            }
            throw error;
        }
        if (typeof data?.configured !== 'boolean') {
            throw new Error('The notification settings response was invalid.');
        }
        return data.configured;
    }
}
