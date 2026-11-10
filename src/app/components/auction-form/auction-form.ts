import { CommonModule } from '@angular/common';
import { Component, inject, Input, output, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auction } from '../../services/auction';
import { SupabaseService } from '../../services/supabase';
import { IAuctionCurrency, ICreateAuctionPayload } from '../../types';

@Component({
  imports: [
    CommonModule,
    ReactiveFormsModule,
  ],
  selector: 'app-auction-form',
  styleUrl: './auction-form.css',
  templateUrl: './auction-form.html',
})
export class AuctionForm {

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auctionService = inject(Auction);
  private readonly supabaseService = inject(SupabaseService);

  @Input({ required: true }) guildId!: string;

  auctionCreated = output<void>();
  closeModal = output<void>();
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  // Default end time: 24 hours from now (formatted for datetime-local input)
  private defaultEndTime(): string {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  }

  form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    is_blind: [false],
    currencies: this.fb.array([this.createCurrencyGroup()]),
    end_time: [this.defaultEndTime(), [Validators.required]],
  });

  get currencyControls(): FormArray {
    return this.form.controls.currencies;
  }

  private createCurrencyGroup() {
    return this.fb.group({
      symbol: ['', [Validators.required]],
      weight: [1, [Validators.required, Validators.min(1)]],
    });
  }

  addCurrency() {
    this.currencyControls.push(this.createCurrencyGroup());
  }

  removeCurrency(index: number) {
    if (this.currencyControls.length > 1) {
      this.currencyControls.removeAt(index);
    }
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      const currentUser = await this.supabaseService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User authentication session not found.');
      }

      const formValues = this.form.getRawValue();

      const currencies: IAuctionCurrency[] = formValues.currencies.map((currency) => ({
        symbol: currency.symbol.trim(),
        weight: currency.weight,
      }));

      const payload: ICreateAuctionPayload = {
        guild_id: this.guildId,
        title: formValues.title.trim(),
        description: formValues.description.trim() || null,
        is_blind: formValues.is_blind,
        currencies,
        end_time: new Date(formValues.end_time).toISOString(),
      };

      await this.auctionService.createAuction(payload, currentUser.id);
      this.auctionCreated.emit();
    } catch (err: any) {
      console.error('Failed to create auction:', err);
      this.errorMessage.set(err.message || 'Failed to create auction. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  cancel() {
    this.closeModal.emit();
  }
}
