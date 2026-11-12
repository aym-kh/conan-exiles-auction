import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Changeslog } from './changeslog';

describe('Changeslog', () => {
  let component: Changeslog;
  let fixture: ComponentFixture<Changeslog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Changeslog],
    }).compileComponents();

    fixture = TestBed.createComponent(Changeslog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
