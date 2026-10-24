import {
  ChoiceSettingDTO, ImageSettingDTO, RangeSettingDTO, SettingCategoryDTO, SettingDTO, SettingsDTO,
  SettingsViewModel, ShortcutSettingDTO, ToggleSettingDTO
} from '../../viewModel/settingsViewModel';
import { t } from '../../i18n/i18n';
import { ICON, toggleOverlay } from './wrappedHtmlElements';
import { confirmDestructiveAction } from './confirmations';

/**
 * Where "reopen the settings dialog once the page comes back" is left.
 *
 * Session storage, not local: it is a note to the very next load of this tab and means nothing
 * afterwards. Changing the language reloads the page - it is the only honest way to redraw an
 * interface whose every string was read while it was being built - and a reload that dropped
 * the user back on the workspace would make setting a language and then a date format two
 * separate journeys through the menu.
 */
const REOPEN_KEY = 'settings-dialog-reopen';

/** Leaves the note. */
function markSettingsForReopen(): void {
  try {
    sessionStorage.setItem(REOPEN_KEY, '1');
  } catch {
    // Session storage can be refused outright. Losing the note costs one trip through the
    // menu, which is not worth failing a language change over.
  }
}

/**
 * Takes the note, if there is one. Taken rather than read: it answers exactly one load.
 *
 * @return whether the settings dialog should be opened again
 */
export function consumeSettingsReopen(): boolean {
  try {
    const found = sessionStorage.getItem(REOPEN_KEY) !== null;
    sessionStorage.removeItem(REOPEN_KEY);
    return found;
  } catch {
    return false;
  }
}

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
   * Re-reads the shortcut when the page gets the focus back: it is changed on Chrome's own page,
   * in another tab, and somebody returning from there expects to see what they just set.
   */
  private readonly regainedFocus = () => void this.viewModel.refreshShortcut();

  /** Set when the last picture chosen could not be used; said under the setting until the next. */
  private imageFailed = false;

  /**
   * @param viewModel supplies the settings and stores the changes; injectable for testing
   */
  constructor(viewModel: SettingsViewModel = new SettingsViewModel()) {
    this.viewModel = viewModel;
  }

  /**
   * Builds the dialog, loads the settings into it, and shows it.
   *
   * @param category the one category to open unfolded; the first one when not given
   */
  public show(category?: string): void {
    this.dialogEl = this.build();
    document.body.appendChild(this.dialogEl);

    this.unsubscribe = this.viewModel.observables.settings
      .subscribe(settings => this.render(settings));

    this.dialogEl.addEventListener('close', () => this.dispose());
    this.dialogEl.showModal();
    toggleOverlay(true);

    if (category) {
      this.viewModel.expandOnly(category);
    } else {
      this.viewModel.refresh();
    }
    void this.viewModel.refreshShortcut();
    window.addEventListener('focus', this.regainedFocus);
  }

  private hide(): void {
    this.dialogEl?.close();
  }

  /** Detaches the subscription and the element; the dialog is rebuilt on the next open. */
  private dispose(): void {
    window.removeEventListener('focus', this.regainedFocus);
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
    heading.textContent = t('settings.title');
    dialog.appendChild(heading);

    this.listEl = document.createElement('div');
    this.listEl.classList.add('settings-dialog__list');
    dialog.appendChild(this.listEl);

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'settings-dialog__actions');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = t('common.close');
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
        ? t('settings.profileNote', { name: settings.profileName })
        : t('settings.profileNoteUnnamed')));

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
    switch (setting.kind) {
      case 'toggle':
        return this.buildToggle(setting);
      case 'choice':
        return this.buildChoice(setting);
      case 'image':
        return this.buildImage(setting);
      case 'shortcut':
        return this.buildShortcut(setting);
      default:
        return this.buildRange(setting);
    }
  }

  /**
   * A setting that is one of a list: its name, a dropdown, and what it does.
   *
   * The dropdown acts on `change` rather than on a confirming button, the way the toggles and
   * the slider here do: this dialog has no OK, only a Close, because everything in it takes
   * effect as it is answered.
   */
  private buildChoice(setting: ChoiceSettingDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('settings-dialog__row', 'settings-dialog__row--choice');

    const text = document.createElement('div');
    text.classList.add('settings-dialog__text');

    const heading = document.createElement('div');
    heading.classList.add('settings-dialog__range-heading');

    const title = document.createElement('label');
    title.classList.add('settings-dialog__name');
    title.textContent = setting.title;
    title.htmlFor = `settings-choice-${setting.key}`;

    const select = document.createElement('select');
    select.id = title.htmlFor;
    select.classList.add('editable', 'input-dialog__input', 'input-dialog__select',
      'settings-dialog__select');
    setting.options.forEach(option => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });
    select.value = setting.value;
    select.disabled = Boolean(setting.disabledReason);

    select.addEventListener('change', () => void this.answerChoice(setting, select.value));

    const explanation = document.createElement('span');
    explanation.classList.add('settings-dialog__explanation');
    explanation.textContent = setting.disabledReason ?? setting.explanation;

    heading.appendChild(title);
    text.appendChild(heading);
    text.appendChild(select);
    text.appendChild(explanation);
    row.appendChild(text);
    return row;
  }

  /**
   * Stores the answer, and rebuilds the page when the answer was a language.
   *
   * The dialog is asked to come back after the reload rather than being left behind: somebody
   * who has just opened this screen to set a language is very often here to set the date
   * format too, and a reload that dropped them on the workspace would make that a second
   * journey through the application menu.
   */
  private async answerChoice(setting: ChoiceSettingDTO, value: string): Promise<void> {
    if (await this.viewModel.setChoice(setting.key, value)) {
      markSettingsForReopen();
      window.location.reload();
    }
  }

  /**
   * Applies a checkbox, asking first when turning the setting off deletes something.
   * Declined, the box goes back to ticked and nothing is stored.
   */
  private async onToggled(setting: ToggleSettingDTO, checkbox: HTMLInputElement): Promise<void> {
    if (!checkbox.checked && setting.confirmOff) {
      const { title, message, confirm } = setting.confirmOff;
      if (!await confirmDestructiveAction(title, message, confirm)) {
        checkbox.checked = true;
        return;
      }
    }
    await this.viewModel.toggle(setting.key, checkbox.checked);
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
      checkbox.addEventListener('change', () => void this.onToggled(setting, checkbox));
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
   * A keyboard shortcut: what it is set to, and a button to Chrome's page for changing it.
   */
  private buildShortcut(setting: ShortcutSettingDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('settings-dialog__row', 'settings-dialog__row--shortcut');

    const text = document.createElement('div');
    text.classList.add('settings-dialog__text');

    const heading = document.createElement('div');
    heading.classList.add('settings-dialog__range-heading');

    const title = document.createElement('span');
    title.classList.add('settings-dialog__name');
    title.textContent = setting.title;

    const value = document.createElement(setting.shortcut ? 'kbd' : 'span');
    value.classList.add('settings-dialog__value');
    value.textContent = setting.display;

    heading.appendChild(title);
    heading.appendChild(value);

    const actions = document.createElement('div');
    actions.classList.add('settings-dialog__image-actions');

    const change = document.createElement('button');
    change.type = 'button';
    change.classList.add('add', 'settings-dialog__shortcut-change');
    change.textContent = t('settings.bookmarkShortcut.change');
    change.addEventListener('click', () => this.viewModel.openShortcutSettings());
    actions.appendChild(change);

    const explanation = document.createElement('span');
    explanation.classList.add('settings-dialog__explanation');
    explanation.textContent = setting.explanation;

    text.appendChild(heading);
    text.appendChild(actions);
    text.appendChild(explanation);
    row.appendChild(text);
    return row;
  }

  /**
   * A setting that is a picture: its name, a button that opens a file picker, and - once there
   * is one - a button that takes it away.
   */
  private buildImage(setting: ImageSettingDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('settings-dialog__row', 'settings-dialog__row--image');
    if (setting.disabledReason) {
      row.classList.add('settings-dialog__row--disabled');
      row.title = setting.disabledReason;
    }

    const text = document.createElement('div');
    text.classList.add('settings-dialog__text');

    const heading = document.createElement('div');
    heading.classList.add('settings-dialog__range-heading');

    const title = document.createElement('span');
    title.classList.add('settings-dialog__name');
    title.textContent = setting.title;

    heading.appendChild(title);

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (file) void this.answerImage(file);
    });

    const actions = document.createElement('div');
    actions.classList.add('settings-dialog__image-actions');

    const choose = document.createElement('button');
    choose.type = 'button';
    choose.classList.add('add');
    choose.textContent = t(setting.hasImage
      ? 'settings.backgroundImage.change' : 'settings.backgroundImage.choose');
    choose.disabled = Boolean(setting.disabledReason);
    choose.addEventListener('click', () => picker.click());
    actions.appendChild(choose);

    if (setting.hasImage) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.classList.add('danger');
      remove.textContent = t('settings.backgroundImage.remove');
      remove.addEventListener('click', () => {
        this.imageFailed = false;
        void this.viewModel.clearBackgroundImage();
      });
      actions.appendChild(remove);
    }

    const explanation = document.createElement('span');
    explanation.classList.add('settings-dialog__explanation');
    explanation.textContent = this.imageFailed
      ? t('settings.backgroundImage.failed')
      : setting.disabledReason ?? setting.explanation;

    text.appendChild(heading);
    text.appendChild(actions);
    text.appendChild(picker);
    text.appendChild(explanation);
    row.appendChild(text);
    return row;
  }

  /** Stores the chosen picture, and says so under the setting if it could not be used. */
  private async answerImage(file: File): Promise<void> {
    this.imageFailed = !(await this.viewModel.setBackgroundImage(file));
    this.viewModel.refresh();
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
