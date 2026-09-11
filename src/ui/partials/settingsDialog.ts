import {
  RangeSettingDTO, SettingCategoryDTO, SettingDTO, SettingsDTO, SettingsViewModel,
  ToggleSettingDTO
} from '../../viewModel/settingsViewModel';
import { ICON, toggleOverlay } from './wrappedHtmlElements';

/**
 * The settings screen.
 *
 * A <dialog> wearing the input dialog's frame, opened from the application menu, exactly as
 * the profile manager is - it answers one question about the profile you are looking at rather
 * than being a place you navigate to.
 *
 * **It says which profile it is about, in the heading.** Settings are stored on the profile
 * record, which is what carries them to the account without a store of their own; the cost of
 * that is that two profiles are two sets of preferences, and a screen that did not say so
 * would look broken to anyone who set something in one profile and switched to another.
 *
 * Settings are drawn in collapsible categories, of which "UI and behavior" is the first. One
 * category is not worth folding away, but the list is going to grow - and a screen that has to
 * be scrolled to find out what is on it is one people stop reading. Which categories are
 * folded is the view model's, not the profile's: it is how the screen is being looked at, not
 * something the user set.
 *
 * Each setting draws itself from a DTO, including whether it can be changed at all. Nothing
 * disables anything yet; that arrives with "open links in separate tabs", which contradicts a
 * subgroup's "catch links into tab group" and has to grey it out.
 */
export class SettingsDialog {

  private readonly viewModel: SettingsViewModel;

  private dialogEl: HTMLDialogElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * @param viewModel supplies the settings and stores the changes; injectable for testing
   */
  constructor(viewModel: SettingsViewModel = new SettingsViewModel()) {
    this.viewModel = viewModel;
  }

  /** Builds the dialog, loads the settings into it, and shows it. */
  public show(): void {
    this.dialogEl = this.build();
    document.body.appendChild(this.dialogEl);

    this.unsubscribe = this.viewModel.observables.settings
      .subscribe(settings => this.render(settings));

    this.dialogEl.addEventListener('close', () => this.dispose());
    this.dialogEl.showModal();
    toggleOverlay(true);

    this.viewModel.refresh();
  }

  private hide(): void {
    this.dialogEl?.close();
  }

  /** Detaches the subscription and the element; the dialog is rebuilt on the next open. */
  private dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    toggleOverlay(false);
    this.dialogEl?.remove();
    this.dialogEl = null;
    this.listEl = null;
  }

  private build(): HTMLDialogElement {

    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'settings-dialog');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = 'Settings';
    dialog.appendChild(heading);

    this.listEl = document.createElement('div');
    this.listEl.classList.add('settings-dialog__list');
    dialog.appendChild(this.listEl);

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'settings-dialog__actions');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.classList.add('add');
    closeBtn.addEventListener('click', () => this.hide());

    actions.appendChild(closeBtn);
    dialog.appendChild(actions);

    // Clicking the backdrop closes it, matching every other dialog here.
    dialog.addEventListener('click', event => {
      if (event.target === dialog) this.hide();
    });

    return dialog;
  }

  /** Redraws from the view model; called on every change to it. */
  private render(settings: SettingsDTO): void {
    if (!this.listEl) return;
    this.listEl.replaceChildren();

    // Every setting here belongs to one profile, and the dialog is opened from a menu that
    // does not say which one is loaded.
    this.listEl.appendChild(this.note(
      settings.profileName
        ? `These apply to the profile "${settings.profileName}", and to it on every device you `
          + 'are signed in on.'
        : 'These apply to the profile you have open.'));

    settings.categories.forEach(
      category => this.listEl!.appendChild(this.buildCategory(category)));
  }

  /**
   * One category: a heading that folds it away, and the settings under it.
   *
   * The heading is a button rather than a clickable div, so that it is reachable by keyboard
   * and announces itself as something that does something.
   */
  private buildCategory(category: SettingCategoryDTO): HTMLElement {

    const section = document.createElement('section');
    section.classList.add('settings-dialog__category');

    const heading = document.createElement('button');
    heading.type = 'button';
    heading.classList.add('settings-dialog__category-head');
    heading.setAttribute('aria-expanded', String(!category.collapsed));
    heading.addEventListener('click', () => this.viewModel.toggleCategory(category.key));

    const chevron = document.createElement('span');
    chevron.classList.add('settings-dialog__chevron');
    chevron.textContent = category.collapsed ? ICON.EXPAND : ICON.COLLAPSE;

    const title = document.createElement('span');
    title.textContent = category.title;

    heading.appendChild(chevron);
    heading.appendChild(title);
    section.appendChild(heading);

    const body = document.createElement('div');
    body.classList.add('settings-dialog__category-body');
    body.hidden = category.collapsed;
    category.settings.forEach(setting => body.appendChild(this.buildRow(setting)));
    section.appendChild(body);

    return section;
  }

  /** One setting, drawn the way its kind is drawn. */
  private buildRow(setting: SettingDTO): HTMLElement {
    return setting.kind === 'toggle' ? this.buildToggle(setting) : this.buildRange(setting);
  }

  /** A setting that is on or off: a checkbox, its name, and what it does. */
  private buildToggle(setting: ToggleSettingDTO): HTMLElement {

    const row = document.createElement('label');
    row.classList.add('settings-dialog__row');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('settings-dialog__checkbox');
    checkbox.checked = setting.enabled;

    if (setting.disabledReason) {
      checkbox.disabled = true;
      row.classList.add('settings-dialog__row--disabled');
      row.title = setting.disabledReason;
    } else {
      checkbox.addEventListener('change',
        () => void this.viewModel.toggle(setting.key, checkbox.checked));
    }

    const text = document.createElement('div');
    text.classList.add('settings-dialog__text');

    const title = document.createElement('span');
    title.classList.add('settings-dialog__name');
    title.textContent = setting.title;

    const explanation = document.createElement('span');
    explanation.classList.add('settings-dialog__explanation');
    explanation.textContent = setting.disabledReason ?? setting.explanation;

    text.appendChild(title);
    text.appendChild(explanation);

    row.appendChild(checkbox);
    row.appendChild(text);
    return row;
  }

  /**
   * A setting that is a number: a slider, with what it is set to beside it.
   *
   * The slider acts while it is dragged rather than when it is let go, because the thing it
   * changes is the size of everything around it - including the dialog it is in. Seeing that
   * happen is how somebody knows which way to drag; a size that only arrived on release would
   * make this a guessing game played one attempt at a time.
   */
  private buildRange(setting: RangeSettingDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('settings-dialog__row', 'settings-dialog__row--range');

    const text = document.createElement('div');
    text.classList.add('settings-dialog__text');

    const heading = document.createElement('div');
    heading.classList.add('settings-dialog__range-heading');

    const title = document.createElement('span');
    title.classList.add('settings-dialog__name');
    title.textContent = setting.title;

    const value = document.createElement('span');
    value.classList.add('settings-dialog__value');
    value.textContent = setting.display;

    heading.appendChild(title);
    heading.appendChild(value);

    const explanation = document.createElement('span');
    explanation.classList.add('settings-dialog__explanation');
    explanation.textContent = setting.disabledReason ?? setting.explanation;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.classList.add('settings-dialog__slider');
    slider.min = String(setting.min);
    slider.max = String(setting.max);
    slider.step = String(setting.step);
    slider.value = String(setting.value);
    slider.disabled = Boolean(setting.disabledReason);
    slider.title = setting.title;

    slider.addEventListener('input',
      () => void this.viewModel.setRange(setting.key, Number(slider.value)));

    text.appendChild(heading);
    text.appendChild(slider);
    text.appendChild(explanation);
    row.appendChild(text);
    return row;
  }

  private note(text: string): HTMLElement {
    const note = document.createElement('p');
    note.classList.add('settings-dialog__note');
    note.textContent = text;
    return note;
  }
}
