import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuctionForm } from './auction-form';

describe('AuctionForm', () => {
  let component: AuctionForm;
  let fixture: ComponentFixture<AuctionForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionForm],
    }).compileComponents();

    fixture = TestBed.createComponent(AuctionForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
