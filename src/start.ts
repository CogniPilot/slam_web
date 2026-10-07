import {startupScreen} from './startup-screen';

const startup = startupScreen();
void import('./main').catch(error => startup.fail(error, false));
