import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from './title';

describe('Title', () => {
  let component: Title;
  let fixture: ComponentFixture<Title>;
  const content = {
    title: 'Test title',
    subtitle: 'Test subtitle',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Title],
    }).compileComponents();

    fixture = TestBed.createComponent(Title);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('content', content);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the provided title and subtitle', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(content.title);
    expect(compiled.querySelector('small')?.textContent).toContain(content.subtitle);
  });
});
