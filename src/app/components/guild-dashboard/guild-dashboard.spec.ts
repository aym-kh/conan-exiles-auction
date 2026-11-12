import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auction } from '../../services/auction';
import { IAuction } from '../../types';
import { GuildDashboard } from './guild-dashboard';

describe('GuildDashboard', () => {
  let component: GuildDashboard;
  let fixture: ComponentFixture<GuildDashboard>;
  let fetchedAuctionIds: string[];
  const auctions: IAuction[] = [
    {
      id: 'auction-1',
      guild_id: 'guild-1',
      seller_discord_id: 'seller-1',
      title: 'First Auction',
      description: 'First description',
      is_blind: false,
      currencies: [{ symbol: 'gold_coin', weight: 1 }],
      status: 'ACTIVE',
      end_time: '2026-12-01T12:00:00.000Z',
      created_at: '2026-11-12T12:00:00.000Z',
    },
    {
      id: 'auction-2',
      guild_id: 'guild-1',
      seller_discord_id: 'seller-2',
      title: 'Second Auction',
      description: 'Second description',
      is_blind: true,
      currencies: [{ symbol: 'gold_bar', weight: 2 }],
      status: 'ACTIVE',
      end_time: '2026-12-02T12:00:00.000Z',
      created_at: '2026-11-12T13:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    fetchedAuctionIds = [];
    await TestBed.configureTestingModule({
      imports: [GuildDashboard],
      providers: [
        provideRouter([]),
        {
          provide: Auction,
          useValue: {
            getGuildAuctions: async () => auctions,
            getAuctionById: async (id: string) => {
              fetchedAuctionIds.push(id);
              return auctions.find((auction) => auction.id === id) ?? null;
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GuildDashboard);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fetches selected auction details into the side panel', async () => {
    fixture.componentRef.setInput('guildId', 'guild-1');
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchedAuctionIds).toEqual(['auction-1']);
    const auctionRows = fixture.nativeElement.querySelectorAll('.auction-select') as NodeListOf<HTMLButtonElement>;
    expect(auctionRows.length).toBe(2);
    expect(fixture.nativeElement.querySelector('[role="timer"]')?.textContent?.trim())
      .toMatch(/^\d+:\d{2}:\d{2}$/);
    auctionRows[1].click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchedAuctionIds).toEqual(['auction-1', 'auction-2']);
    const displayedTitle = fixture.nativeElement
      .querySelector('.auction-detail-content h4')
      ?.textContent?.trim();
    expect(displayedTitle).toBe('Second Auction');
  });
});
