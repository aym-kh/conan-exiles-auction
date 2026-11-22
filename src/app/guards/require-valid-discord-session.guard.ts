import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase';

export const requireValidDiscordSession: CanActivateFn = async () => {
    const supabase = inject(SupabaseService);
    const router = inject(Router);

    if (await supabase.hasValidDiscordSession()) {
        return true;
    }

    try {
        await supabase.signOut();
    } catch (error) {
        console.error('Failed to clear an expired Discord session:', error);
    }
    return router.createUrlTree(['/']);
};
