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

  function setMultiItemMode(enabled: boolean) {
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector(
      'input[formControlName="has_multiple_items"]',
    ) as HTMLInputElement;
    checkbox.checked = enabled;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('supports open, anonymous, and sealed bidding formats', () => {
    fixture.detectChanges();

    const formatControl = component.form.controls.bid_visibility;
    expect(formatControl.value).toBe('open');
    formatControl.setValue('anonymous');
    expect(formatControl.value).toBe('anonymous');
    formatControl.setValue('sealed');
    expect(formatControl.value).toBe('sealed');
  });

  it('starts a multi-item auction with two required item forms', () => {
    setMultiItemMode(true);

    expect(component.itemControls.length).toBe(2);
    expect(component.form.controls.title.valid).toBe(true);
    expect(component.itemControls.at(0).controls.title.invalid).toBe(true);
    expect(component.hasTooFewItems).toBe(false);
  });

  it('requires at least two items and restores the auction title requirement for single-item mode', () => {
    setMultiItemMode(true);
    component.itemControls.clear();

    expect(component.hasTooFewItems).toBe(true);

    setMultiItemMode(false);

    expect(component.itemControls.length).toBe(0);
    expect(component.form.controls.title.invalid).toBe(true);
  });
});
