import { Routes } from '@angular/router';
import { Login } from './components/login/login';
import { GuildSelector } from './components/guild-selector/guild-selector';
import { GuildDashboard } from './components/guild-dashboard/guild-dashboard';
import { AuctionDetail } from './components/auction-detail/auction-detail';
import { redirectSignedInUsers } from './guards/redirect-signed-in-users.guard';

export const routes: Routes = [
    { path: '', pathMatch: 'full', canActivate: [redirectSignedInUsers], component: Login },
    { path: 'guilds', component: GuildSelector },
    { path: 'guilds/:guildId', component: GuildDashboard },
    { path: 'auctions/:auctionId', component: AuctionDetail },
    { path: '**', redirectTo: '' }
];
