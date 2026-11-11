import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuctionPlate } from './auction-plate';

describe('AuctionPlate', () => {
  let component: AuctionPlate;
  let fixture: ComponentFixture<AuctionPlate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionPlate],
    }).compileComponents();

    fixture = TestBed.createComponent(AuctionPlate);
    fixture.componentRef.setInput('auction', {
      title: 'Test auction',
      description: null,
      end_time: new Date(Date.now() - 1000).toISOString(),
    });
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows zero when the auction end time has passed', () => {
    const timer = fixture.nativeElement.querySelector('[role="timer"]');
    expect(timer.textContent.trim()).toBe('00:00:00');
  });
});
