const sinon = require('sinon');
const chai = require('chai');
const { expect } = chai;
const V6_LOG_REPORT = require('./__mocks__/v6-log-data');
const V6_JSON_BUFFER = require('./__mocks__/v6-json-buffer.json');
const V6_JSON_BUFFER_EMPTY = require('./__mocks__/v6-json-buffer-empty.json');
const V7_JSON_BUFFER = require('./__mocks__/v7-json-buffer.json');
const V7_JSON_BUFFER_EMPTY = require('./__mocks__/v7-json-buffer-empty.json');
const consoleUtil = require('../utils/console');
const { isWholeNumber, mapLevelToNumber, getVulnerabilities, isJsonString, filterValidException } = require('../utils/common');
const { handleFinish, handleUserInput, BASE_COMMAND, SUCCESS_MESSAGE, LOGS_EXCEEDED_MESSAGE } = require('../index');

const { FG_WHITE, RESET_COLOR } = consoleUtil;

describe('console utils', () => {
  it('should wrap error console message with styling format correctly', () => {
    const stub = sinon.stub(console, 'error');
    const message = 'console message';

    expect(stub.called).to.equal(false);
    consoleUtil.error(message);

    expect(stub.called).to.equal(true);
    expect(stub.calledWith(`${FG_WHITE}${message}${RESET_COLOR}`)).to.equal(true);
    stub.restore();
  });

  it('should wrap error info message with styling format correctly', () => {
    const stub = sinon.stub(console, 'info');
    const message = 'console message';

    expect(stub.called).to.equal(false);
    consoleUtil.info(message);

    expect(stub.called).to.equal(true);
    expect(stub.calledWith(`${FG_WHITE}${message}${RESET_COLOR}`)).to.equal(true);
    stub.restore();
  });
});

describe('common utils', () => {
  it('should return true for valid JSON object', () => {
    expect(isJsonString(JSON.stringify({ a: 1, b: { c: 2 } }))).to.equal(true);
  });

  it('should return false if it is not a valid JSON object', () => {
    expect(isJsonString('abc')).to.equal(false);
  });

  it('should be able to determine a whole number', () => {
    expect(isWholeNumber()).to.equal(false);
    expect(isWholeNumber(0.14)).to.equal(false);
    expect(isWholeNumber(20.45)).to.equal(false);
    expect(isWholeNumber('')).to.equal(false);
    expect(isWholeNumber('2.50')).to.equal(false);
    expect(isWholeNumber(null)).to.equal(false);
    expect(isWholeNumber('true')).to.equal(false);

    expect(isWholeNumber(1)).to.equal(true);
    expect(isWholeNumber(2920)).to.equal(true);
    expect(isWholeNumber(934)).to.equal(true);
    expect(isWholeNumber('0920')).to.equal(true);

    expect(isWholeNumber(true)).to.equal(true); // Should handle this?
  });

  it('should be able to map audit level to correct numbers', () => {
    expect(mapLevelToNumber('info')).to.equal(0);
    expect(mapLevelToNumber('low')).to.equal(1);
    expect(mapLevelToNumber('moderate')).to.equal(2);
    expect(mapLevelToNumber('high')).to.equal(3);
    expect(mapLevelToNumber('critical')).to.equal(4);
    // default and exceptions
    expect(mapLevelToNumber('unknown')).to.equal(0);
    expect(mapLevelToNumber()).to.equal(0);
    expect(mapLevelToNumber(true)).to.equal(0);
    expect(mapLevelToNumber(false)).to.equal(0);
    expect(mapLevelToNumber({})).to.equal(0);
  });

  it('should be able to filter valid file exceptions correctly', () => {
    const exceptions = {
      '137': {
        ignore: true,
        reason: 'Ignored since we dont use xxx method',
      },
      '581': {
        reason: 'Ignored since we dont use xxx method',
      },
      '980': 'Ignored since we dont use xxx method',
      '5': '',
      '3': null,
      '2': undefined,
      '1': false,
      'invalid': 'Ignored since we dont use xxx method',
    };
    const expected = [
      { id: 1, reason: undefined },
      { id: 2, reason: undefined },
      { id: 3, reason: undefined },
      { id: 5, reason: undefined },
      { id: 137, ignore: true, reason: 'Ignored since we dont use xxx method' },
      { id: 980, reason: 'Ignored since we dont use xxx method' },
    ];

    expect(filterValidException(exceptions)).to.deep.equal(expected);
  });

  it('should be able to filter valid file exceptions with expiry dates correctly', () => {
    const exceptions = {
      '137': {
        ignore: true,
        expiry: 1615462130000,
      },
      '581': {
        ignore: true,
        expiry: 1615462140000,
      },
      '980': {
        ignore: true,
        expiry: 1615462150000,
      },
    };

    expect(filterValidException(exceptions)).to.deep.equal([]);
    let clock = sinon.stub(Date, 'now').returns(1615462140000);

    expect(filterValidException(exceptions)).to.deep.equal([
      { id: 980, ignore: true, expiry: 1615462150000 },
    ]);

    clock.restore();
    clock = sinon.stub(Date, 'now').returns(1615462130000);

    expect(filterValidException(exceptions)).to.deep.equal([
      { id: 581, ignore: true, expiry: 1615462140000 },
      { id: 980, ignore: true, expiry: 1615462150000 },
    ]);

    clock.restore();
  });
});

describe('event handlers', () => {
  it('should be able to pass exceptions from the command correctly', () => {
    const stub = sinon.stub();
    const options = {
      ignore: '1567,919',
    };

    expect(stub.called).to.equal(false);
    handleUserInput(options, stub);
    expect(stub.called).to.equal(true);

    const auditCommand = BASE_COMMAND;
    const auditLevel = 0;
    const fullLog = false;
    const exceptionIds = [1567, 919];
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, exceptionIds)).to.equal(true);

    // with space
    options.ignore = '1567, 1902';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, [1567, 1902])).to.equal(true);

    // invalid exceptions
    options.ignore = '1134,undefined,888';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, [1134, 888])).to.equal(true);

    // invalid NaN
    options.ignore = '1134,NaN,3e,828';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, [1134, 828])).to.equal(true);

    // invalid decimals
    options.ignore = '1199,29.41,628';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, [1199, 628])).to.equal(true);
  });

  it('should be able to handle audit level from the command correctly', () => {
    const stub = sinon.stub();
    const consoleStub = sinon.stub(console, 'info');
    const options = {
      level: 'info',
    };

    expect(stub.called).to.equal(false);
    handleUserInput(options, stub);
    expect(stub.called).to.equal(true);

    const auditCommand = BASE_COMMAND;
    const fullLog = false;
    const exceptionIds = [];
    expect(stub.calledWith(auditCommand, 0, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: info]')).to.equal(true);

    // low
    options.level = 'low';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 1, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: low]')).to.equal(true);

    // moderate
    options.level = 'moderate';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 2, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: moderate]')).to.equal(true);

    // high
    options.level = 'high';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 3, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: high]')).to.equal(true);

    // critical
    options.level = 'critical';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 4, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: critical]')).to.equal(true);

    consoleStub.restore();
  });

  it('should be able to use audit level from the environment variables correctly', () => {
    const stub = sinon.stub();
    const consoleStub = sinon.stub(console, 'info');
    const options = {};
    const auditCommand = BASE_COMMAND;
    const fullLog = false;
    const exceptionIds = [];

    // info
    process.env.NPM_CONFIG_AUDIT_LEVEL = 'info';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 0, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: info]')).to.equal(true);

    // low
    process.env.NPM_CONFIG_AUDIT_LEVEL = 'low';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 1, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: low]')).to.equal(true);

    // moderate
    process.env.NPM_CONFIG_AUDIT_LEVEL = 'moderate';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 2, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: moderate]')).to.equal(true);

    // high
    process.env.NPM_CONFIG_AUDIT_LEVEL = 'high';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 3, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: high]')).to.equal(true);

    // critical
    process.env.NPM_CONFIG_AUDIT_LEVEL = 'critical';
    handleUserInput(options, stub);
    expect(stub.calledWith(auditCommand, 4, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[level: critical]')).to.equal(true);

    // Clean up
    consoleStub.restore();
    process.env.NPM_CONFIG_AUDIT_LEVEL = undefined;
  });

  it('should be able to handle production flag from the command correctly', () => {
    const stub = sinon.stub();
    const consoleStub = sinon.stub(console, 'info');
    const options = {
      production: true,
    };

    expect(stub.called).to.equal(false);
    handleUserInput(options, stub);
    expect(stub.called).to.equal(true);

    const auditCommand = `${BASE_COMMAND} --production`;
    const auditLevel = 0;
    const fullLog = false;
    const exceptionIds = [];
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[production mode enabled]')).to.equal(true);

    consoleStub.restore();
  });

  it('should be able to handle full logs flag from the command correctly', () => {
    const stub = sinon.stub();
    const consoleStub = sinon.stub(console, 'info');
    const options = {
      full: true,
    };

    expect(stub.called).to.equal(false);
    handleUserInput(options, stub);
    expect(stub.called).to.equal(true);

    const auditCommand = BASE_COMMAND;
    const auditLevel = 0;
    const fullLog = true;
    const exceptionIds = [];
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, exceptionIds)).to.equal(true);
    expect(consoleStub.calledWith('[report display limit disabled]')).to.equal(true);

    consoleStub.restore();
  });

  it('should be able to handle default command correctly', () => {
    const stub = sinon.stub();
    const options = {};

    expect(stub.called).to.equal(false);
    handleUserInput(options, stub);
    expect(stub.called).to.equal(true);

    const auditCommand = BASE_COMMAND;
    const auditLevel = 0;
    const fullLog = false;
    const exceptionIds = [];
    expect(stub.calledWith(auditCommand, auditLevel, fullLog, exceptionIds)).to.equal(true);
  });

  it('should be able to handle the success result properly', () => {
    const stub = sinon.stub(consoleUtil, 'info');
    const vulnerabilities = [];

    expect(stub.called).to.equal(false);
    handleFinish(vulnerabilities);
    expect(stub.called).to.equal(true);
    expect(stub.calledWith(SUCCESS_MESSAGE)).to.equal(true);
    stub.restore();
  });

  it('should be able to handle the found vulnerabilities properly', () => {
    const stubProcess = sinon.stub(process, 'exit');
    const stubConsole = sinon.stub(consoleUtil, 'error');
    const vulnerabilities = [1165, 1890];

    expect(stubProcess.called).to.equal(false);
    expect(stubConsole.called).to.equal(false);

    handleFinish(vulnerabilities);

    expect(stubProcess.called).to.equal(true);
    expect(stubConsole.called).to.equal(true);

    expect(stubProcess.calledWith(1)).to.equal(true);
    expect(stubConsole.calledWith('2 vulnerabilities found. Node security advisories: 1165,1890')).to.equal(true);

    stubProcess.restore();
    stubConsole.restore();
  });

  it('should be able to handle normal log display correctly', () => {
    const stub = sinon.stub(console, 'info');
    const smallLog = '123456789';
    const displayFullLog = true;
    const maxLength = 50;
    const vulnerabilities = [];

    expect(stub.called).to.equal(false);
    handleFinish(vulnerabilities, smallLog, { displayFullLog, maxLength });
    expect(stub.called).to.equal(true);
    expect(stub.calledWith(smallLog)).to.equal(true);
    stub.restore();
  });

  it('should display overlength log properly', () => {
    const stub = sinon.stub(console, 'info');
    const displayFullLog = true;
    const maxLength = 500;
    const vulnerabilities = [];

    expect(stub.called).to.equal(false);
    handleFinish(vulnerabilities, V6_LOG_REPORT, { displayFullLog, maxLength });
    expect(stub.called).to.equal(true);
    // Full log
    expect(stub.calledWith(V6_LOG_REPORT)).to.equal(true);
    stub.restore();
  });

  it('should display an additional message on overlength log', () => {
    const stub = sinon.stub(console, 'info');
    const displayFullLog = false;
    const maxLength = 500;
    const vulnerabilities = [];

    let expectedDisplay = V6_LOG_REPORT.substring(0, maxLength);
    expectedDisplay += '\n\n';
    expectedDisplay += '...';
    expectedDisplay += '\n\n';
    expectedDisplay += LOGS_EXCEEDED_MESSAGE;
    expectedDisplay += '\n\n';

    expect(stub.called).to.equal(false);
    handleFinish(vulnerabilities, V6_LOG_REPORT, { displayFullLog, maxLength });
    expect(stub.called).to.equal(true);
    expect(stub.calledWith(expectedDisplay)).to.equal(true);
    stub.restore();
  });

  it('should be able to handle log display within maximum length properly', () => {
    const stub = sinon.stub(console, 'info');
    const data = '123456789';
    const fullLog = false;
    const maxLength = 9;
    const vulnerabilities = [];

    expect(stub.called).to.equal(false);
    handleFinish(vulnerabilities, data, fullLog, maxLength);
    expect(stub.called).to.equal(true);
    expect(stub.calledWith('123456789')).to.equal(true);
    stub.restore();
  });
});

describe('npm v6', () => {
  describe('retrieve vulnerabilities', () => {
    it('should be able to handle correctly for empty vulnerability scan', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER_EMPTY);
      const auditLevel = 0; // info
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(0).and.to.deep.equal([]);
    });

    it('should be able to get info level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 0; // info
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(11).and.to.deep.equal([975, 976, 985, 1084, 1179, 1213, 1500, 1523, 1555, 1556, 1589]);
    });

    it('should be able to get low level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 1; // low
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(11).and.to.deep.equal([975, 976, 985, 1084, 1179, 1213, 1500, 1523, 1555, 1556, 1589]);
    });

    it('should be able to get moderate level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 2; // moderate
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(5).and.to.deep.equal([975, 976, 985, 1213, 1555]);
    });

    it('should be able to get high level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 3; // high
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(2).and.to.deep.equal([1213, 1555]);
    });

    it('should be able to get critical level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 4; // critical
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(1).and.to.deep.equal([1555]);
    });
  });

  describe('using exceptions', () => {
    it('should be able to filter out all vulnerabilities correctly', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 4; // critical
      const exceptions = [1213, 1500, 1555];
      const result = getVulnerabilities(jsonString, auditLevel, exceptions);

      expect(result).to.have.length(0).and.to.deep.equal([]);
    });

    it('should be able to filter out targeted vulnerabilities correctly', () => {
      const jsonString = JSON.stringify(V6_JSON_BUFFER);
      const auditLevel = 0; // info
      const exceptions = [1213, 1500, 1555, 9999];
      const result = getVulnerabilities(jsonString, auditLevel, exceptions);

      expect(result).to.have.length(8).and.to.deep.equal([975, 976, 985, 1084, 1179, 1523, 1556, 1589]);
    });
  });
});

describe('npm v7', () => {
  describe('retrieve vulnerabilities', () => {
    it('should be able to handle correctly for empty vulnerability scan', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER_EMPTY);
      const auditLevel = 0; // info
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(0).and.to.deep.equal([]);
    });

    it('should be able to get info level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 0; // info
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(11).and.to.deep.equal([1555, 1213, 1589, 1523, 1084, 1179, 1556, 975, 976, 985, 1500]);
    });

    it('should be able to get low level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 1; // low
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(10).and.to.deep.equal([1555, 1213, 1589, 1523, 1084, 1179, 1556, 975, 976, 985]);
    });

    it('should be able to get moderate level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 2; // moderate
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(5).and.to.deep.equal([1555, 1213, 975, 976, 985]);
    });

    it('should be able to get high level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 3; // high
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(2).and.to.deep.equal([1555, 1213]);
    });

    it('should be able to get critical level vulnerabilities from JSON buffer', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 4; // critical
      const result = getVulnerabilities(jsonString, auditLevel);

      expect(result).to.have.length(1).and.to.deep.equal([1555]);
    });
  });

  describe('using exceptions', () => {
    it('should be able to filter out all vulnerabilities correctly', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 4; // critical
      const exceptions = [1555, 1213];
      const result = getVulnerabilities(jsonString, auditLevel, exceptions);

      expect(result).to.have.length(0).and.to.deep.equal([]);
    });

    it('should be able to filter out targeted vulnerabilities correctly', () => {
      const jsonString = JSON.stringify(V7_JSON_BUFFER);
      const auditLevel = 0; // info
      const exceptions = [1213, 1500, 1555, 9999];
      const result = getVulnerabilities(jsonString, auditLevel, exceptions);

      expect(result).to.have.length(8).and.to.deep.equal([1589, 1523, 1084, 1179, 1556, 975, 976, 985]);
    });
  });
});
