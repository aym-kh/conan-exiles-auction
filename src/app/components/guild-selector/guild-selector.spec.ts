import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GuildSelector } from './guild-selector';

describe('GuildSelector', () => {
  let component: GuildSelector;
  let fixture: ComponentFixture<GuildSelector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuildSelector],
    }).compileComponents();

    fixture = TestBed.createComponent(GuildSelector);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
