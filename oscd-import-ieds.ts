/* eslint-disable import/no-extraneous-dependencies */
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';

import '@material/web/button/text-button';
import '@material/web/dialog/dialog';
import { Dialog } from '@material/web/dialog/internal/dialog';

import '@openenergytools/filterable-lists/dist/selection-list.js';
import type {
  SelectionList,
  SelectItem,
} from '@openenergytools/filterable-lists/dist/selection-list.js';

import { Edit, newEditEvent } from '@openscd/open-scd-core';
import { insertIed } from '@openenergytools/scl-lib';

type IEDImport = {
  ied: Element;
  unique: boolean;
};

function uniqueNewIED(
  doc: XMLDocument,
  newIED: Element,
  ieds: IEDImport[],
): boolean {
  const duplicateNewIED = ieds.some(
    ied => ied.ied.getAttribute('name') === newIED.getAttribute('name'),
  );

  const duplicateToExistingIEDs = !!doc.querySelector(
    `:root > IED[name="${newIED.getAttribute('name')}"]`,
  );

  return !(duplicateNewIED || duplicateToExistingIEDs);
}

function getIedDescription(ied: Element): {
  firstLine: string;
  secondLine: string;
} {
  const [
    manufacturer,
    type,
    desc,
    configVersion,
    originalSclVersion,
    originalSclRevision,
    originalSclRelease,
  ] = [
    'manufacturer',
    'type',
    'desc',
    'configVersion',
    'originalSclVersion',
    'originalSclRevision',
    'originalSclRelease',
  ].map(attr => ied?.getAttribute(attr));

  const firstLine = [manufacturer, type]
    .filter(val => val !== null)
    .join(' - ');

  const schemaInformation = [
    originalSclVersion,
    originalSclRevision,
    originalSclRelease,
  ]
    .filter(val => val !== null)
    .join('');

  const secondLine = [desc, configVersion, schemaInformation]
    .filter(val => val !== null)
    .join(' - ');

  return { firstLine, secondLine };
}

/** An editor [[`plugin`]] to import IEDs from SCL files */
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

  @query('#selection-dialog') dialogUI!: Dialog;

  @query('#selection-list') selectionList!: SelectionList;

  async run() {
    this.input.click();
  }

  async importIEDs(): Promise<void> {
    const ieds = this.selectionList.selectedElements;
    const scl = this.doc.querySelector('SCL')!;

    for await (const ied of ieds) {
      const iedName = ied.getAttribute('name');

      // If IED exists remove it
      const existingIed = this.doc.querySelector(
        `:root > IED[name="${iedName}"]`,
      );

      const removeEdits: Edit[] = [];

      if (existingIed) {
        removeEdits.push({ node: existingIed });
      }

      // If IED has communications remove them
      // TODO: Could have logic to remove the SubNetwork if required
      const existingComms = Array.from(
        this.doc.querySelectorAll(
          `:root > Communication > SubNetwork > ConnectedAP[iedName="${iedName}"]`,
        ),
      );

      if (existingComms) {
        removeEdits.push(
          existingComms.map(connectedAp => ({ node: connectedAp })),
        );
      }

      this.dispatchEvent(newEditEvent(removeEdits));

      this.dispatchEvent(
        newEditEvent(insertIed(scl, ied, { addCommunicationSection: true })),
      );

      // TODO: Fixme -- ugly timeout that might resolve with newer versions of OpenSCD core
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
            unique: uniqueNewIED(this.doc, newIED, ieds),
          }),
        );
    }

    this.items = ieds.map(ied => {
      const { firstLine, secondLine } = getIedDescription(ied.ied);

      return {
        headline: `${ied.ied.getAttribute('name')!} — ${firstLine}`,
        supportingText: secondLine,
        attachedElement: ied.ied,
        selected: ied.unique,
      };
    });

    this.dialogUI.show();
  }

  render() {
    return html`<input
        @click=${({ target }: MouseEvent) => {
          // eslint-disable-next-line no-param-reassign
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadIEDs}
        id="importieds-plugin-input"
        accept=".iid,.cid,.icd,.scd,.sed,.ssd"
        type="file"
        multiple
      /><md-dialog
        id="selection-dialog"
        @cancel=${(event: Event) => event.preventDefault()}
      >
        <form slot="content" id="selection" method="dialog">
          <selection-list
            id="selection-list"
            .items=${this.items}
            filterable
          ></selection-list>
        </form>
        <div slot="actions">
          <md-text-button @click=${() => this.dialogUI.close()}
            >Close</md-text-button
          >
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

    form {
      padding: 10px;
    }
  `;
}
