import { Routes } from '@angular/router';
import { Login } from './components/login/login';
import { GuildSelector } from './components/guild-selector/guild-selector';
import { GuildDashboard } from './components/guild-dashboard/guild-dashboard';
import { AuctionDetail } from './components/auction-detail/auction-detail';
import { redirectSignedInUsers } from './guards/redirect-signed-in-users.guard';
import { requireSignedInUser } from './guards/require-signed-in-user.guard';
import { requireValidDiscordSession } from './guards/require-valid-discord-session.guard';

export const routes: Routes = [
    { path: '', pathMatch: 'full', canActivate: [redirectSignedInUsers], component: Login },
    { path: 'guilds', canActivate: [requireSignedInUser, requireValidDiscordSession], component: GuildSelector },
    { path: 'guilds/:guildId', canActivate: [requireSignedInUser, requireValidDiscordSession], component: GuildDashboard },
    { path: 'auctions/:auctionId', canActivate: [requireSignedInUser, requireValidDiscordSession], component: AuctionDetail },
    { path: '**', redirectTo: '' }
];
