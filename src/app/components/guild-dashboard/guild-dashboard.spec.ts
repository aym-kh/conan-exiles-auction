import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GuildDashboard } from './guild-dashboard';

describe('GuildDashboard', () => {
  let component: GuildDashboard;
  let fixture: ComponentFixture<GuildDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuildDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(GuildDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
