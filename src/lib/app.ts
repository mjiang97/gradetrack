import { AggrRowHdr, ColHdr, SectionInfo, TextScore } from 'grades-client-lib/dist/lib/zod-schemas.js';
import { makeWsGrades, WsGrades } from './ws-grades.js';

import { Errors as E, Types as T, SECTION_IDS } from 'grades-client-lib';

/** Factory function for App.  Does any asynchronous initialization
 * before calling constructor.
 */
export default async function makeApp(wsHostUrl: string) {
  const wsGrades = await makeWsGrades(wsHostUrl);
  //TODO: do any async initialization
  return new App(wsGrades);
}

class App {
  private readonly wsGrades: WsGrades;
  private sectionId: T.SectionId;
  private isEditable: boolean;

  constructor(wsGrades: WsGrades) { //TODO: add more args if necessary
    this.wsGrades = wsGrades;
    this.sectionId = '' as T.SectionId;
    this.isEditable = false;

    //TODO: add #sectionId options, set up change handler for form widgets
    //      and other stuff
    document.querySelector('#grades-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
    });

    const sectionSelect = document.querySelector('#section-id');
    SECTION_IDS.forEach(async (sectionId) => {
      const wsResult = await this.wsGrades.getSectionInfo(sectionId);
      if (wsResult.isOk) {
        const sectionInfo = wsResult.val;
        const option = makeElement('option', { value: sectionId }, sectionInfo.name);
        sectionSelect.append(option);
      } else {
        errors(wsResult);
      }
    });
    sectionSelect?.addEventListener('change', (ev) => {
      this.sectionId = (ev.target as HTMLSelectElement).value as T.SectionId;
      this.doGradesTable();
    });

    const isEditableCheckbox = document.querySelector('#is-editable');
    isEditableCheckbox?.addEventListener('change', (ev) => {
      this.isEditable = (ev.target as HTMLInputElement).checked === true;
      this.doGradesTable();
    });
  }
  
  // TODO: add methods, including properties initialized to
  // fat-arrow functions (to avoid problems with this).
  async doGradesTable() {
    const gradesTable = document.querySelector('#grades');
    const table = makeElement('table', { id: 'grades' }, '');
    if (!this.sectionId) {
      gradesTable.replaceWith(table);
      return;
    }
    const wsResult = await this.wsGrades.getSectionInfo(this.sectionId);
    if (!wsResult.isOk) {
      gradesTable.replaceWith(table);
      return;
    }
    const sectionInfo = wsResult.val;
    const headerRow = document.createElement('tr');
    Object.values(sectionInfo.colHdrs).forEach((colHdr) => {
      const th = document.createElement('th');
      th.textContent = colHdr.name;
      headerRow.append(th);
    })
    table.appendChild(headerRow);
    const getSectionDataWsResult = await this.wsGrades.getAllSectionData(this.sectionId);
    if (!getSectionDataWsResult.isOk) {
      errors(getSectionDataWsResult);
      return;
    }
    for (const [rowId, rowData] of Object.entries(getSectionDataWsResult.val)) {
      const row = document.createElement('tr');
      const isAggrRow = rowId.startsWith('$');
      for (const [colId, score] of Object.entries(rowData)) {
        const cell = document.createElement('td');
        const colHdr = sectionInfo.colHdrs[colId as T.ColId];
        const isRawScore = colHdr._tag === 'numScore' || colHdr._tag === 'textScore';
        if (this.isEditable && !isAggrRow && isRawScore) {
          const input = makeElement( 
            'input', 
            {
              'type': 'text', 
              'value': score !== null ? String(score) : '', 
              'data-sectionId': this.sectionId, 
              'data-rowId': rowId, 
              'data-colId': colId
            });
            input.addEventListener('change', this.inputChange);
            cell.appendChild(input);
        } else {
          const displayValue = isAggrRow && colId === Object.keys(rowData)[0] ? 
                             aggrRowDisplayName(rowId) : 
                             (score !== null ? String(score) : '');
          const scoreSpan = makeElement(
            'span', 
            {
              'data-sectionId': this.sectionId, 
              'data-rowId': rowId,
              'data-colId': colId
            }, 
            displayValue
          );
          cell.appendChild(scoreSpan);
        }
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
    gradesTable.replaceWith(table);
  }

  private inputChange = async (ev: Event) => {
    const input = ev.currentTarget as HTMLInputElement;
    const sectionId = input.getAttribute('data-sectionId') as T.SectionId;
    const rowId = input.getAttribute('data-rowId') as T.StudentId;
    const colId = input.getAttribute('data-colId') as T.ColId;
    const value = input.value;

    let newScore: T.Score;
    if (value === '') {
      newScore = null;
    }
    else if (!isNaN(Number(value))) {
      newScore = Number(value);
    }
    else {
      newScore = value;
    }
    const addScoreResult = await this.wsGrades.addScore(sectionId, rowId, colId, newScore);
    if (!addScoreResult.isOk) {
      errors(addScoreResult);
    }
  };
}

//TODO: add any necessary functions
function aggrRowDisplayName(rowId: string) : string {
  switch(rowId) {
    case '$count': return 'Count';
    case '$max': return 'Max';
    case '$min': return 'Min';
    case '$avg': return 'Average';
    default: return rowId;
  }
}

/******************************** Errors *******************************/

/** add errors from result to #errors */
function errors<T>(result: E.Result<T, E.Errs>) {
  if (result.isOk === true) return;
  const errWidget = document.querySelector('#errors');
  for (const e of result.err.errors()) {
    errWidget.append(makeElement('li', {}, e.message));
  }
}

/** clear out all errors from #errors */
function clearErrors() {
  const errWidget = document.querySelector('#errors');
  errWidget.innerHTML = '';
}

/***************************** DOM Utilities ***************************/

/** Return a new DOM element with specified tagName, attributes
 *  given by object attrs and contained text.
 */
function makeElement(tagName: string, attrs: {[attr: string]: string} = {},
		     text='')
  : HTMLElement
{
  const element = document.createElement(tagName);
  for (const [k, v] of Object.entries(attrs)) {
    element.setAttribute(k, v);
  }
  if (text.length > 0) element.append(text);
  return element;
}

