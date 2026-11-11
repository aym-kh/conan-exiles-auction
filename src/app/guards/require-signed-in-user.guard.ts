import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { SupabaseService } from '../services/supabase';

export const requireSignedInUser: CanActivateFn = async () => {
    const supabase = inject(SupabaseService);
    const router = inject(Router);
    const user = await firstValueFrom(
        supabase.user$.pipe(
            filter((currentUser) => currentUser !== undefined),
            take(1),
        ),
    );

    return user ? true : router.createUrlTree(['/']);
};
