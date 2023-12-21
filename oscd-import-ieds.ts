/* eslint-disable import/no-extraneous-dependencies */
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';

import '@material/web/button/text-button';
import '@material/web/dialog/dialog';
import { Dialog } from '@material/web/dialog/internal/dialog';

import '@openenergytools/filterable-lists/dist/selection-list.js';
import type {
  SelectionList,
  SelectItem
} from '@openenergytools/filterable-lists/dist/selection-list.js';

import { newEditEvent } from '@openscd/open-scd-core';
import { insertIed } from '@openenergytools/scl-lib';

type IEDImport = {
  ied: Element;
  unique: boolean;
};

function uniqueNewIED(
  doc: XMLDocument,
  newIED: Element,
  ieds: IEDImport[]
): boolean {
  const duplicateNewIED = ieds.some(
    ied => ied.ied.getAttribute('name') === newIED.getAttribute('name')
  );

  const duplicateToExistingIEDs = !!doc.querySelector(
    `:root > IED[name="${newIED.getAttribute('name')}"]`
  );

  return !(duplicateNewIED || duplicateToExistingIEDs);
}

/** An editor [[`plugin`]] to configure `Report`, `GOOSE`, `SampledValue` control blocks and its `DataSet` */
export default class ImportIEDsPlugin extends LitElement {
  /** The document being edited as provided to plugins by [[`OpenSCD`]]. */
  @property({ attribute: false })
  doc!: XMLDocument;

  /** SCL change indicator */
  @property({ type: Number })
  editCount = -1;

  @state()
  items: SelectItem[] = [];

  @query('input') input!: HTMLInputElement;

  @query('#selection-dialog') dialog!: Dialog;

  @query('#selection-list') selectionList!: SelectionList;

  async run() {
    this.input.click();
  }

  async importIEDs(): Promise<void> {
    const ieds = this.selectionList.selectedElements;
    const scl = this.doc.querySelector('SCL')!;

    for await (const ied of ieds) {
      this.dispatchEvent(newEditEvent(insertIed(scl, ied)));

      // ugly timeout that might resolve with newer versions of OpenSCD core
      await setTimeout(() => {}, 100);
    }
  }

  /** Loads the file `event.target.files[0]` into [[`src`]] as a `blob:...`. */
  async loadIEDs(event: Event): Promise<void> {
    const files = (<HTMLInputElement | null>event.target)?.files;
    if (!files) return;

    const ieds: { ied: Element; unique: boolean }[] = [];
    for await (const file of Array.from(files)) {
      const text = await file.text();

      new DOMParser()
        .parseFromString(text, 'application/xml')
        .querySelectorAll('IED')
        .forEach(newIED =>
          ieds.push({
            ied: newIED,
            unique: uniqueNewIED(this.doc, newIED, ieds)
          })
        );
    }

    this.items = ieds.map(ied => ({
      headline: `${ied.ied.getAttribute('name')}`,
      supportingText: `${ied.ied.getAttribute('manufacturer')}`,
      attachedElement: ied.ied,
      selected: ied.unique
    }));

    this.dialog.show();
  }

  render() {
    return html`<input
        @click=${({ target }: MouseEvent) => {
          // eslint-disable-next-line no-param-reassign
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadIEDs}
        id="importied-plugin-input"
        accept=".iid,.cid,.icd,.scd,.sed,.ssd"
        type="file"
        multiple
      /><md-dialog id="selection-dialog">
        <form slot="content" id="selection" method="dialog">
          <selection-list
            id="selection-list"
            .items=${this.items}
            filterable
          ></selection-list>
        </form>
        <div slot="actions">
          <md-text-button
            @click="${() => {
              this.importIEDs();
            }}"
            form="selection"
            >Import</md-text-button
          >
        </div></md-dialog
      >`;
  }

  static styles = css`
    input {
      width: 0;
      height: 0;
      opacity: 0;
    }
  `;
}
