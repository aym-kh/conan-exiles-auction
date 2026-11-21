import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auction } from '../../services/auction';
import { IAuction } from '../../types';
import { GuildDashboard } from './guild-dashboard';

describe('GuildDashboard', () => {
  let component: GuildDashboard;
  let fixture: ComponentFixture<GuildDashboard>;
  let fetchedAuctionIds: string[];
  let requestedCompletedAuctionPages: number[];
  let completedAuctionPage: (page: number) => Promise<{ auctions: IAuction[]; total: number }>;
  const auctions: IAuction[] = [
    {
      id: 'auction-1',
      guild_id: 'guild-1',
      seller_discord_id: 'seller-1',
      title: 'First Auction',
      description: 'First description',
      bid_visibility: 'open',
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
      bid_visibility: 'anonymous',
      currencies: [{ symbol: 'gold_bar', weight: 2 }],
      status: 'ACTIVE',
      end_time: '2026-12-02T12:00:00.000Z',
      created_at: '2026-11-12T13:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    fetchedAuctionIds = [];
    requestedCompletedAuctionPages = [];
    completedAuctionPage = async () => ({ auctions: [], total: 0 });
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
            getGuildCompletedSealedAuctions: async (_guildId: string, page: number) => {
              requestedCompletedAuctionPages.push(page);
              return completedAuctionPage(page);
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

  it('lists completed sealed auctions with pagination', async () => {
    const archivedAuctions: IAuction[] = [
      {
        ...auctions[0],
        id: 'completed-1',
        title: 'Completed Auction One',
        bid_visibility: 'sealed',
        status: 'ENDED',
        end_time: '2026-11-01T12:00:00.000Z',
      },
      {
        ...auctions[1],
        id: 'completed-2',
        title: 'Completed Auction Two',
        bid_visibility: 'sealed',
        status: 'ENDED',
        end_time: '2026-10-01T12:00:00.000Z',
      },
    ];
    completedAuctionPage = async (page) => ({
      auctions: [archivedAuctions[page - 1]],
      total: 11,
    });

    fixture.componentRef.setInput('guildId', 'guild-1');
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const archive = fixture.nativeElement.querySelector('.completed-auctions') as HTMLElement;
    expect(requestedCompletedAuctionPages).toEqual([1]);
    expect(archive.textContent).toContain('Completed Auction One');
    expect(archive.textContent).toContain('Page 1 of 2');

    const paginationButtons = archive.querySelectorAll('nav button') as NodeListOf<HTMLButtonElement>;
    paginationButtons[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(requestedCompletedAuctionPages).toEqual([1, 2]);
    expect(archive.textContent).toContain('Completed Auction Two');
    expect(archive.textContent).toContain('Page 2 of 2');
  });
});
