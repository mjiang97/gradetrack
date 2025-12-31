import { SectionId } from 'grades-client-lib/dist/lib/types.js';
import { makeGradesWs, GradesWs } from './grades-ws.js';

import { Errors as E, Types as T, Grades, AggrFns } from 'grades-client-lib';
import { SectionInfo } from 'grades-client-lib/dist/lib/zod-schemas.js';

/** factory function for WsGrades */
export async function makeWsGrades(wsHostUrl: string) {
  //TODO: add async initialization if necessary
  return new WsGrades(wsHostUrl); //TODO: can add more args if necessary
}

/** Provide convenience API for the DOM layer.
 *  Uses an instance of Grades as a cache.  All aggregate computation
 *  is performed by the cache.  The web services are used to ensure
 *  that the cache is sync'd with the state of the server.
 */
export class WsGrades {
  private readonly grades: Grades;  //cache for server data
  private readonly ws: GradesWs;
  //TODO: add more properties if needed

  constructor(wsHostUrl: string) {
    this.grades = new Grades(AggrFns.rowAggrFns, AggrFns.colAggrFns);
    this.ws = makeGradesWs(wsHostUrl);
    //TODO: add more initializations if necessary
  }

  //TODO: add methods as necessary
  async getSectionInfo(sectionId: T.SectionId): Promise<E.Result<T.SectionInfo, E.Errs>> {
    const cachedSectionInfo = this.grades.getSectionInfo(sectionId);
    if (cachedSectionInfo.isOk) {
      return E.toErrs(cachedSectionInfo);
    }
    try {
      const wsResult = await this.ws.getSectionInfo(sectionId);
      if (!wsResult.isOk) {
        return wsResult;
      }
      const sectionInfo = wsResult.val;
      if (!sectionInfo) {
        return E.errResult(E.Errs.err('Received invalid section info (null or undefined)'));
      }
      const addResult = this.grades.addSectionInfo(sectionInfo);
      if (!addResult.isOk) {
        return E.errResult(E.Errs.err(addResult));
      }
      return E.okResult(sectionInfo);
    } catch(err) {
      return E.errResult(E.Errs.err(`Failed to get or cache section info: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  async getAllSectionData(sectionId: T.SectionId): Promise<E.Result<T.SectionData, E.Errs>> {
    try {
      const sectionDataWsResult = await this.ws.getRawSectionData(sectionId);
      if (!sectionDataWsResult.isOk) {
        return sectionDataWsResult;
      }
      const sectionData = sectionDataWsResult.val;
      const studentIds = Object.keys(sectionData) as T.StudentId[];
      for (const studentId of studentIds) {
        const studentWsResult = await this.ws.getStudent(studentId);
        if (!studentWsResult.isOk) {
          return studentWsResult;
        }
        const student = studentWsResult.val;
        const addStudent = this.grades.addStudent(student);
        const enrollStudent = this.grades.enrollStudent(sectionId, studentId);
        if (!enrollStudent.isOk) {
          return E.errResult(E.Errs.err(`${enrollStudent}`));
        }
        const data = sectionData[studentId];
        for (const [colId, score] of Object.entries(data)) {
          if (colId !== 'id')  {
            const addScore = this.grades.addScore(sectionId, studentId, colId as T.ColId, score as T.Score);
            if (!addScore.isOk) {
              return E.errResult(E.Errs.err(`${addScore}`));
            }
          }
        }
      }
      const sectionGradesResult = this.grades.getSectionData(sectionId);
      if (!sectionGradesResult.isOk) {
        return E.errResult(E.Errs.err(sectionGradesResult));
      }
      return E.okResult(sectionGradesResult.val);
    } catch(err) {
      return E.errResult(E.Errs.err(`Failed to get all section data: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  
  async addScore(sectionId: T.SectionId, studentId: T.StudentId, colId: T.ColId, score: T.Score): Promise<E.Result<void, E.Errs>> {
    try {
      const addScoreResult = this.grades.addScore(sectionId, studentId, colId, score);
      if (!addScoreResult.isOk) {
        return E.toErrs(addScoreResult);
      }
      const addScoreWsResult = await this.ws.addScore(sectionId, studentId, colId, score);
      return addScoreWsResult;
    } catch(err) {
      return E.errResult(E.Errs.err(`Failed to add score: ${err instanceof Error ? err.message : String(err)}`));
    }   
  }
}
