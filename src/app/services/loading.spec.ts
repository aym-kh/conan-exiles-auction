import { LoadingService } from './loading';

describe('LoadingService', () => {
  it('keeps loading until all tracked tasks finish', async () => {
    const service = new LoadingService();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = service.track(() => new Promise<void>((resolve) => {
      finishFirst = resolve;
    }));
    const second = service.track(() => new Promise<void>((resolve) => {
      finishSecond = resolve;
    }));

    expect(service.isLoading()).toBe(true);

    finishFirst();
    await first;
    expect(service.isLoading()).toBe(true);

    finishSecond();
    await second;
    expect(service.isLoading()).toBe(false);
  });
});
