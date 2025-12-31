import makeApp from './app.js';


const WS_HOST_URL = 'https://localhost:2345';

const url = new URL(window.location.href);
const wsUrl = url.searchParams.get('wsUrl') ?? WS_HOST_URL;
makeApp(wsUrl);


/*

//uncomment surrounding /* comment to test web services  
import { makeGradesWs } from './grades-ws.js';
import { Types as T } from 'grades-client-lib';

async function testWs() {
  const ws = makeGradesWs(wsUrl);
  const result = await ws.getRawSectionData('cs201' as T.SectionId);
  return result;
}

//parcel still does not seem to like top-level await.
testWs().then(result => console.log(result));

*/
