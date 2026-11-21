import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase';
import {
    DiscordGuild,
    IAuction,
    IAuctionBid,
    IAuctionImage,
    IAuctionImageUpload,
    ICreateAuctionPayload,
    IUpdateAuctionPayload,
} from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
    AUCTION_IMAGE_MAX_COUNT,
    AUCTION_IMAGE_MAX_SIZE_BYTES,
    AUCTION_IMAGE_MAX_SIZE_LABEL,
} from '../const';

const AUCTION_IMAGE_BUCKET = 'auction-images';
const AUCTION_IMAGE_STAGING_BUCKET = 'auction-image-staging';
const AUCTION_IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};
type AuctionImageRow = Omit<IAuctionImage, 'public_url'>;

@Service()
export class Auction {

    private readonly supabaseService = inject(SupabaseService);

    private get client() {
        return this.supabaseService.client;
    }

    async ensureGuild(guild: Pick<DiscordGuild, 'id' | 'name'>): Promise<void> {
        const { error } = await this.client
            .from('guilds')
            .upsert(
                {
                    discord_guild_id: guild.id,
                    guild_name: guild.name,
                },
                { onConflict: 'discord_guild_id' },
            );

        if (error) {
            console.error(`Error saving Discord guild ${guild.id}:`, error);
            throw error;
        }
    }

    async getGuildAuctions(guildId: string): Promise<IAuction[]> {
        const { data, error } = await this.client
            .from('auctions')
            .select('*')
            .eq('guild_id', guildId)
            .eq('status', 'ACTIVE')
            .gt('end_time', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error(`Error fetching auctions for guild ${guildId}:`, error);
            throw error;
        }

        return data || [];
    }

    async getGuildCompletedSealedAuctions(
        guildId: string,
        page: number,
        pageSize: number,
    ): Promise<{ auctions: IAuction[]; total: number }> {
        const from = (page - 1) * pageSize;
        const now = new Date().toISOString();
        const { data, count, error } = await this.client
            .from('auctions')
            .select('*', { count: 'exact' })
            .eq('guild_id', guildId)
            .eq('bid_visibility', 'sealed')
            .or(`status.eq.ENDED,and(status.eq.ACTIVE,end_time.lte.${now})`)
            .order('end_time', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            console.error(`Error fetching completed sealed auctions for guild ${guildId}:`, error);
            throw error;
        }

        return { auctions: data ?? [], total: count ?? 0 };
    }

    async getAuctionById(auctionId: string): Promise<IAuction | null> {
        const { data, error } = await this.client
            .from('auctions')
            .select('*')
            .eq('id', auctionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            console.error(`Error fetching auction ${auctionId}:`, error);
            throw error;
        }

        return {
            ...data,
            items: await this.getAuctionItems(auctionId),
        };
    }

    private async getAuctionItems(auctionId: string) {
        const { data, error } = await this.client
            .from('auction_items')
            .select('*')
            .eq('auction_id', auctionId)
            .order('sort_order', { ascending: true });

        if (error) {
            console.error(`Error fetching items for auction ${auctionId}:`, error);
            throw error;
        }

        return data ?? [];
    }

    async getAuctionImages(auctionId: string): Promise<IAuctionImage[]> {
        const { data, error } = await this.client
            .from('auction_images')
            .select('*')
            .eq('auction_id', auctionId)
            .order('sort_order', { ascending: true });

        if (error) {
            console.error(`Error fetching images for auction ${auctionId}:`, error);
            throw error;
        }

        return (data ?? []).map((image) => ({
            ...image,
            public_url: this.client.storage.from(AUCTION_IMAGE_BUCKET).getPublicUrl(image.storage_path).data.publicUrl,
        }));
    }

    async uploadStagedAuctionImage(file: Blob): Promise<string> {
        const extension = AUCTION_IMAGE_TYPES[file.type];
        if (!extension) {
            throw new Error('Images must be JPEG, PNG, or WebP files.');
        }
        if (file.size > AUCTION_IMAGE_MAX_SIZE_BYTES) {
            throw new Error(`Each image must be ${AUCTION_IMAGE_MAX_SIZE_LABEL.replace('MB', ' MB')} or smaller.`);
        }

        const userId = await this.getAuthenticatedUserId();
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await this.client.storage
            .from(AUCTION_IMAGE_STAGING_BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
            console.error('Error uploading staged auction image:', error);
            throw error;
        }
        return path;
    }

    async removeStagedAuctionImage(path: string): Promise<void> {
        const userId = await this.getAuthenticatedUserId();
        if (!this.isStagedAuctionImagePath(path, userId)) {
            throw new Error('The staged image path is invalid.');
        }

        const { error } = await this.client.storage.from(AUCTION_IMAGE_STAGING_BUCKET).remove([path]);
        if (error) {
            console.error('Error removing staged auction image:', error);
            throw error;
        }
    }

    async syncAuctionImages(
        auctionId: string,
        previousImages: IAuctionImage[],
        retainedImageIds: string[],
        uploads: IAuctionImageUpload[],
        onUploadProgress?: (completed: number, total: number) => void,
    ): Promise<void> {
        const stagedPaths = uploads.flatMap((upload) => upload.staged_path ? [upload.staged_path] : []);
        if (stagedPaths.length > 0) {
            const userId = await this.getAuthenticatedUserId();
            if (stagedPaths.some((path) => !this.isStagedAuctionImagePath(path, userId))) {
                throw new Error('A staged auction image is invalid. Remove it and upload it again.');
            }
        }

        if (previousImages.some((image) =>
            image.auction_id !== auctionId || !image.storage_path.startsWith(`${auctionId}/`))) {
            throw new Error('The selected auction images are invalid. Reload the auction and try again.');
        }
        const uniqueRetainedIds = new Set(retainedImageIds);
        if (uniqueRetainedIds.size !== retainedImageIds.length
            || retainedImageIds.some((id) => !previousImages.some((image) => image.id === id))) {
            throw new Error('The selected auction images are invalid. Reload the auction and try again.');
        }

        const { data: currentRows, error: currentRowsError } = await this.client
            .from('auction_images')
            .select('*')
            .eq('auction_id', auctionId);
        if (currentRowsError) {
            console.error(`Error checking existing images for auction ${auctionId}:`, currentRowsError);
            throw currentRowsError;
        }
        if ((currentRows ?? []).some((image) => !image.storage_path.startsWith(`${auctionId}/`))) {
            throw new Error('An auction image has an invalid storage path. Contact support before editing images.');
        }

        const currentById = new Map<string, AuctionImageRow>(
            (currentRows ?? []).map((image) => [image.id, image]),
        );
        for (const id of retainedImageIds) {
            if (!currentById.has(id)) {
                throw new Error('An auction image has changed. Reload the auction and try again.');
            }
        }

        const itemRows = await this.getAuctionItems(auctionId);
        const itemIds = new Set(itemRows.map((item) => item.id));
        const counts = new Map<string, number>();
        const groupKey = (itemId: string | null) => itemId ?? 'auction';
        const retainedRows = retainedImageIds.flatMap((id) => {
            const image = currentById.get(id);
            return image ? [image] : [];
        });

        for (const image of retainedRows) {
            if (
                itemIds.size > 0
                    ? image.item_id === null || !itemIds.has(image.item_id)
                    : image.item_id !== null
            ) {
                throw new Error('An image is linked to an item that no longer exists.');
            }
            const key = groupKey(image.item_id);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        for (const upload of uploads) {
            if (!AUCTION_IMAGE_TYPES[upload.file.type]) {
                throw new Error('Images must be JPEG, PNG, or WebP files.');
            }
            if (upload.file.size > AUCTION_IMAGE_MAX_SIZE_BYTES) {
                throw new Error(`Each image must be ${AUCTION_IMAGE_MAX_SIZE_LABEL.replace('MB', ' MB')} or smaller.`);
            }
            if ((upload.item_id === null && itemIds.size > 0)
                || (upload.item_id !== null && !itemIds.has(upload.item_id))) {
                throw new Error('An image is linked to an invalid auction item.');
            }
            const key = groupKey(upload.item_id);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        if ([...counts.values()].some((count) => count > AUCTION_IMAGE_MAX_COUNT)) {
            throw new Error(`Each item can have up to ${AUCTION_IMAGE_MAX_COUNT} images.`);
        }

        const uploadedPaths: string[] = [];
        const insertedImageIds: string[] = [];
        const newRows: Array<Omit<AuctionImageRow, 'id' | 'created_at'>> = [];
        try {
            const nextSortOrder = new Map<string, number>();
            for (const image of retainedRows) {
                const key = groupKey(image.item_id);
                nextSortOrder.set(key, Math.max(nextSortOrder.get(key) ?? 0, image.sort_order + 1));
            }

            let completedUploads = 0;
            for (const upload of uploads) {
                const extension = AUCTION_IMAGE_TYPES[upload.file.type];
                const path = `${auctionId}/${upload.item_id ?? 'auction'}/${crypto.randomUUID()}.${extension}`;
                uploadedPaths.push(path);
                const { error } = upload.staged_path
                    ? await this.client.storage
                        .from(AUCTION_IMAGE_STAGING_BUCKET)
                        .copy(upload.staged_path, path, { destinationBucket: AUCTION_IMAGE_BUCKET })
                    : await this.client.storage
                        .from(AUCTION_IMAGE_BUCKET)
                        .upload(path, upload.file, { contentType: upload.file.type, upsert: false });
                if (error) {
                    console.error(`Error uploading auction image for ${auctionId}:`, error);
                    throw error;
                }
                completedUploads++;
                onUploadProgress?.(completedUploads, uploads.length);

                const key = groupKey(upload.item_id);
                newRows.push({
                    auction_id: auctionId,
                    item_id: upload.item_id,
                    storage_path: path,
                    sort_order: nextSortOrder.get(key) ?? 0,
                });
                nextSortOrder.set(key, (nextSortOrder.get(key) ?? 0) + 1);
            }

            if (newRows.length > 0) {
                const { data, error } = await this.client
                    .from('auction_images')
                    .insert(newRows)
                    .select('id');
                if (error) {
                    console.error(`Error saving image records for auction ${auctionId}:`, error);
                    throw error;
                }
                insertedImageIds.push(...(data ?? []).map((image) => image.id));
            }
        } catch (error) {
            await this.cleanupAuctionImageFiles(auctionId, uploadedPaths);
            throw error;
        }

        const obsoletePaths = new Set<string>();
        for (const image of previousImages) {
            if (!uniqueRetainedIds.has(image.id)) {
                obsoletePaths.add(image.storage_path);
            }
        }
        const obsoleteCurrentIds: string[] = [];
        for (const image of currentRows ?? []) {
            if (!uniqueRetainedIds.has(image.id)) {
                obsoletePaths.add(image.storage_path);
                obsoleteCurrentIds.push(image.id);
            }
        }

        try {
            await this.removeAuctionImageFiles(auctionId, [...obsoletePaths]);
        } catch (error) {
            await this.removeAuctionImageRecords(auctionId, insertedImageIds);
            await this.cleanupAuctionImageFiles(auctionId, uploadedPaths);
            throw error;
        }

        if (obsoleteCurrentIds.length > 0) {
            const { error } = await this.client
                .from('auction_images')
                .delete()
                .eq('auction_id', auctionId)
                .in('id', obsoleteCurrentIds);
            if (error) {
                console.error(`Error removing old image records for auction ${auctionId}:`, error);
                throw error;
            }
        }

        if (stagedPaths.length > 0) {
            try {
                await this.removeStagedAuctionImages(stagedPaths);
            } catch (error) {
                console.error('Auction images were saved, but staged image cleanup failed:', error);
            }
        }
    }

    private async getAuthenticatedUserId(): Promise<string> {
        const { data: { user }, error } = await this.client.auth.getUser();
        if (error) {
            throw error;
        }
        if (!user) {
            throw new Error('Your sign-in session has expired. Sign in again to manage auction images.');
        }
        return user.id;
    }

    private isStagedAuctionImagePath(path: string, userId: string): boolean {
        const prefix = `${userId}/`;
        const filename = path.slice(prefix.length);
        return path.startsWith(prefix)
            && /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename);
    }

    private async removeStagedAuctionImages(paths: string[]): Promise<void> {
        if (paths.length === 0) {
            return;
        }
        const { error } = await this.client.storage.from(AUCTION_IMAGE_STAGING_BUCKET).remove(paths);
        if (error) {
            console.error('Error removing staged auction images:', error);
            throw error;
        }
    }

    private async removeAuctionImageFiles(auctionId: string, paths: string[]): Promise<void> {
        if (paths.length === 0) {
            return;
        }
        const { error } = await this.client.storage.from(AUCTION_IMAGE_BUCKET).remove(paths);
        if (error) {
            console.error(`Error removing image files for auction ${auctionId}:`, error);
            throw error;
        }
    }

    private async cleanupAuctionImageFiles(auctionId: string, paths: string[]): Promise<void> {
        try {
            await this.removeAuctionImageFiles(auctionId, paths);
        } catch (error) {
            console.error(`Could not clean up new image files for auction ${auctionId}:`, error);
        }
    }

    private async removeAuctionImageRecords(auctionId: string, imageIds: string[]): Promise<void> {
        if (imageIds.length === 0) {
            return;
        }
        const { error } = await this.client
            .from('auction_images')
            .delete()
            .eq('auction_id', auctionId)
            .in('id', imageIds);
        if (error) {
            console.error(`Error cleaning up image records for auction ${auctionId}:`, error);
        }
    }

    async getAuctionBids(auctionId: string): Promise<IAuctionBid[]> {
        const { data, error } = await this.client.rpc('get_auction_bids', {
            p_auction_id: auctionId,
        });

        if (error) {
            console.error(`Error fetching bids for auction ${auctionId}:`, error);
            throw error;
        }

        return data ?? [];
    }

    async getAuctionBidCount(auctionId: string, itemId: string | null): Promise<number> {
        const { data, error } = await this.client.rpc('get_auction_bid_count', {
            p_auction_id: auctionId,
            p_item_id: itemId,
        });

        if (error) {
            console.error(`Error fetching bid count for auction ${auctionId}:`, error);
            throw error;
        }
        if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
            throw new Error('Bid count response was invalid.');
        }

        return data;
    }

    async isBidVisibilityLocked(auctionId: string): Promise<boolean> {
        const { data, error } = await this.client.rpc('is_auction_bid_visibility_locked', {
            p_auction_id: auctionId,
        });

        if (error) {
            console.error(`Error checking bidding format lock for auction ${auctionId}:`, error);
            throw error;
        }
        if (typeof data !== 'boolean') {
            throw new Error('Bidding format lock status was invalid.');
        }

        return data;
    }

    async placeBid(
        auctionId: string,
        currencySymbol: string,
        amount: number,
        itemId: string | null = null,
    ): Promise<void> {
        const { data: { session }, error: sessionError } = await this.client.auth.getSession();
        if (sessionError) {
            throw sessionError;
        }
        if (!session?.provider_token) {
            throw new Error('Your Discord session has expired. Sign out and sign in again before bidding.');
        }

        const { error } = await this.client.functions.invoke('place-bid', {
            body: {
                auctionId,
                itemId,
                currencySymbol,
                amount,
                providerToken: session.provider_token,
            },
        });

        if (error) {
            console.error(`Error placing bid on auction ${auctionId}:`, error);
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
    }

    subscribeToAuctionBids(auctionId: string, onChange: () => void): RealtimeChannel {
        return this.client
            .channel(`auction:${auctionId}`, { config: { private: true } })
            .on('broadcast', { event: 'bid_changed' }, onChange)
            .subscribe();
    }

    async updateAuction(
        auctionId: string,
        payload: IUpdateAuctionPayload,
        userId: string,
    ): Promise<IAuction> {
        const { items, ...auctionFields } = payload;
        if (items && items.length < 2) {
            throw new Error('Multi-item auctions must include at least two items.');
        }
        if (items) {
            const itemIds = items.flatMap((item) => item.id ? [item.id] : []);
            if (new Set(itemIds).size !== itemIds.length) {
                throw new Error('An auction item was included more than once.');
            }
        }

        const { data, error } = await this.client
            .from('auctions')
            .update(auctionFields)
            .eq('id', auctionId)
            .eq('seller_discord_id', userId)
            .select()
            .single();

        if (error) {
            console.error(`Error updating auction ${auctionId}:`, error);
            throw error;
        }

        if (items) {
            const existingItems = await this.getAuctionItems(auctionId);
            const existingIds = new Set(existingItems.map((item) => item.id));
            const requestedIds = items.flatMap((item) => item.id ? [item.id] : []);
            if (requestedIds.some((id) => !existingIds.has(id))) {
                throw new Error('An auction item no longer exists. Reload the auction and try again.');
            }

            for (const [index, item] of items.entries()) {
                if (!item.id) {
                    continue;
                }

                const itemId = item.id;
                const { data: updatedItem, error: itemError } = await this.client
                    .from('auction_items')
                    .update({ title: item.title, description: item.description, sort_order: index })
                    .eq('id', itemId)
                    .eq('auction_id', auctionId)
                    .select('id')
                    .maybeSingle();

                if (itemError) {
                    console.error(`Error updating item ${itemId} for auction ${auctionId}:`, itemError);
                    throw itemError;
                }
                if (!updatedItem) {
                    throw new Error('An auction item no longer exists. Reload the auction and try again.');
                }
            }

            if (items.some((item) => !item.id)) {
                const { error: insertError } = await this.client
                    .from('auction_items')
                    .insert(items.flatMap((item, index) => item.id ? [] : [{
                        auction_id: auctionId,
                        title: item.title,
                        description: item.description,
                        sort_order: index,
                    }]));

                if (insertError) {
                    console.error(`Error adding items to auction ${auctionId}:`, insertError);
                    throw insertError;
                }
            }

            const removedIds = existingItems
                .filter((item) => !requestedIds.includes(item.id))
                .map((item) => item.id);
            if (removedIds.length > 0) {
                const { error: deleteError } = await this.client
                    .from('auction_items')
                    .delete()
                    .eq('auction_id', auctionId)
                    .in('id', removedIds);

                if (deleteError) {
                    console.error(`Error removing items from auction ${auctionId}:`, deleteError);
                    throw deleteError;
                }
            }
        }

        return {
            ...data,
            ...(items ? { items: await this.getAuctionItems(auctionId) } : {}),
        };
    }

    async deleteAuction(auctionId: string, userId: string): Promise<void> {
        const images = await this.getAuctionImages(auctionId);
        await this.removeAuctionImageFiles(auctionId, images.map((image) => image.storage_path));

        const { data, error } = await this.client
            .from('auctions')
            .delete()
            .eq('id', auctionId)
            .eq('seller_discord_id', userId)
            .select('id')
            .single();

        if (error) {
            console.error(`Error deleting auction ${auctionId}:`, error);
            throw error;
        }

        if (!data) {
            throw new Error('Auction was not deleted. It may no longer exist or you may not own it.');
        }
    }

    async createAuction(payload: ICreateAuctionPayload, userDiscordId: string): Promise<IAuction> {
        const { items, ...auctionFields } = payload;
        if (items && items.length < 2) {
            throw new Error('Multi-item auctions must include at least two items.');
        }

        const { data, error } = await this.client
            .from('auctions')
            .insert([
                {
                    ...auctionFields,
                    seller_discord_id: userDiscordId,
                    status: 'ACTIVE'
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Error creating auction:', error);
            throw error;
        }

        if (!items?.length) {
            return data;
        }

        const { error: itemsError } = await this.client
            .from('auction_items')
            .insert(items.map((item, index) => ({
                auction_id: data.id,
                title: item.title,
                description: item.description,
                sort_order: index,
            })));

        if (itemsError) {
            console.error(`Error creating items for auction ${data.id}:`, itemsError);
            const { error: rollbackError } = await this.client
                .from('auctions')
                .delete()
                .eq('id', data.id);
            if (rollbackError) {
                console.error(`Failed to remove incomplete auction ${data.id}:`, rollbackError);
            }
            throw itemsError;
        }

        return {
            ...data,
            items: await this.getAuctionItems(data.id),
        };
    }

    async endAuction(auctionId: string): Promise<void> {
        const { error } = await this.client
            .from('auctions')
            .update({ status: 'ENDED' })
            .eq('id', auctionId);

        if (error) {
            console.error(`Error ending auction ${auctionId}:`, error);
            throw error;
        }
    }

    subscribeToGuildAuctions(guildId: string, onChange: () => void): RealtimeChannel {
        return this.client
            .channel(`guild-auctions-${guildId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'auctions',
                    filter: `guild_id=eq.${guildId}`
                },
                () => onChange()
            )
            .subscribe();
    }

}
