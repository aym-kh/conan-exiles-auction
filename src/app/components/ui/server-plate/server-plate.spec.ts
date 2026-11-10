import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServerPlate } from './server-plate';

describe('ServerPlate', () => {
  let component: ServerPlate;
  let fixture: ComponentFixture<ServerPlate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServerPlate],
    }).compileComponents();

    fixture = TestBed.createComponent(ServerPlate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
