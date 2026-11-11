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
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
