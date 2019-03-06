import {LogManager} from 'aurelia-framework';
import {inject} from 'aurelia-framework';
import {EventAggregator} from 'aurelia-event-aggregator';
import {IdentityService} from './services/identity-service';
import {ChaincodeService} from './services/chaincode-service';
import {ConfigService} from './services/config-service';
import {AlertService} from './services/alert-service';
import JSONFormatter from '../node_modules/json-formatter-js/dist/json-formatter';

let log = LogManager.getLogger('Home');

@inject(IdentityService, EventAggregator, ChaincodeService, ConfigService, AlertService)
export class Home {
  channelList = [];
  chaincodeList = [];
  orgList = [];
  installedChain = [];
  blocks = [];
  targets = [];
  oneChannel = null;
  oneChaincode = null;
  targs = [];
  newOrg = null;
  fnc = null;
  args = null;
  selectedChain = null;
  oneCh = null;
  file = null;
  initArgs = null;
  block = null;
  joinCh = null;
  show = true;
  language = 'node';
  lastTx = null;
  version = null;

  constructor(identityService, eventAggregator, chaincodeService, configService, alertService) {
    this.identityService = identityService;
    this.eventAggregator = eventAggregator;
    this.chaincodeService = chaincodeService;
    this.configService = configService;
    this.alertService = alertService;
  }

  attached() {
    this.queryChannels();
    this.queryInstalledChaincodes();
    this.subscriberBlock = this.eventAggregator.subscribe('block', o => {
      log.debug('block', o);
      this.queryChannels();
      if (o.channel_id === this.oneChannel)
        this.updateBlock();
      if (this.oneChannel) {
        this.queryChaincodes();
        this.queryOrgs();
        this.queryPeers();
      }
    });
  }

  detached() {
    this.subscriberBlock.dispose();
  }

  queryChannels() {
    this.chaincodeService.getChannels().then(channels => {
      this.channelList = channels;
      this.channelList.sort();
    });
  }

  addChannel() {
    this.chaincodeService.addChannel(this.oneCh);
    this.channelList.sort();
    this.oneCh = null;
  }

  installChaincode() {
    let formData = new FormData();
    for (let i = 0; i < this.file.length; i++) {
      formData.append('file', this.file[i]);
      // formData.append('channelId', this.oneChannel);
      formData.append('targets', this.targs);
      formData.append('version', this.version || '1.0');
      formData.append('language', this.language);
      this.chaincodeService.installChaincode(formData).then(j => {
        this.queryInstalledChaincodes();
      });
    }
  }

  initChaincode() {
    if (this.selectedChain) {
      this.alertService.info("Send instantiate request");
      this.chaincodeService.instantiateChaincode(this.oneChannel, this.selectedChain, this.initArgs);
    }
    else
      this.alertService.error("Select chaincode");

  }

  queryChaincodes() {
    this.show = false;
    this.chaincodeService.getChaincodes(this.oneChannel).then(chaincodes => {
      this.chaincodeList = chaincodes;
    });
  }

  queryPeers() {
    this.targets = [];
    this.chaincodeService.getPeersForOrgOnChannel(this.oneChannel).then(peers => {
      for (let i = 0; i < peers.length; i++) {
        this.targets.push(peers[i]);
      }
    });
  }

  queryOrgs() {
    this.chaincodeService.getOrgs(this.oneChannel).then(orgs => {
      this.orgList = orgs;
      this.orgList.sort();
    });
  }

  queryInstalledChaincodes() {
    this.chaincodeService.getInstalledChaincodes().then(chain => {
      this.installedChain = chain;
    });
  }

  addOrgToChannel() {
    this.alertService.info("Send invite");
    this.chaincodeService.addOrgToChannel(this.oneChannel, this.newOrg);
    this.newOrg = null;
  }

  joinChannel() {
    this.chaincodeService.joinChannel(this.joinCh);
    this.joinCh = null;
  }

  getInvoke() {
    if (this.fnc && this.args)
      this.chaincodeService.invoke(this.oneChannel, this.oneChaincode, this.fnc, this.args, this.targs).then(invoke => {
        this.lastTx = invoke._transaction_id;
        const formatter = new JSONFormatter(invoke);
        Home.output(formatter.render(), "res");
      });
    else
      this.alertService.error("Write function and arguments");
  }

  getQuery() {
    if (this.oneChaincode === null || this.chaincodeList.indexOf(this.oneChaincode) === -1) {
      this.alertService.error("Choose chaincode");
    }
    else
      this.chaincodeService.query(this.oneChannel, this.oneChaincode, this.fnc, this.args, this.targs).then(query => {
        const formatter = new JSONFormatter(query);
        Home.output(formatter.render(), "res");
      });
  }

  getLastBlock() {
    this.chaincodeService.getLastBlock(this.oneChannel).then(lastBlock => {
      this.chaincodeService.getBlock(this.oneChannel, lastBlock - 1).then(block => {
        let formatter = new JSONFormatter(block);
        Home.output(formatter.render(), "json");
        for (let j = 0; j < block.data.data.length; j++) {
          const info = block.data.data[j].payload;
          this.decodeCert(info.header.signature_header.creator.IdBytes);
        }
      });
    });
  }

  queryBlocks() {
    this.blocks = [];
    let bl = [];
    this.oneChaincode = null;
    this.chaincodeService.getLastBlock(this.oneChannel).then(block => {
      for (let i = block - 5; i < block; i++) {
        if (i < 0)
          continue;
        this.chaincodeService.getBlock(this.oneChannel, i).then(block => {
          let txid = [];
          for (let j = 0; j < block.data.data.length; j++) {
            txid.push(block.data.data[j].payload.header.channel_header.tx_id)
          }
          bl.push({blockNumber: block.header.number, txid: txid.join('; ')});
          bl.sort(function (a, b) {
            return a.blockNumber - b.blockNumber
          });
        });
      }
    });
    bl.sort(function (a, b) {
      return a.blockNumber - b.blockNumber
    });
    this.blocks = bl;
  }

  updateBlock() {
    if (this.blocks.length > 4)
      this.blocks.splice(0, 1);
    this.chaincodeService.getLastBlock(this.oneChannel).then(lastBlock => {
      this.chaincodeService.getBlock(this.oneChannel, lastBlock - 1).then(block => {
        let txid = [];
        let formatter = new JSONFormatter(block);
        Home.output(formatter.render(), "json");
        for (let j = 0; j < block.data.data.length; j++) {
          const info = block.data.data[j].payload;
          if (info.header.channel_header.tx_id === this.lastTx) {
            console.log(this.lastTx + "   " + j);
            Home.parseBlock(info);
            this.decodeCert(info.header.signature_header.creator.IdBytes);
          }
          txid.push(info.header.channel_header.tx_id);
        }
        this.blocks.push({blockNumber: lastBlock - 1, txid: txid.join('; ')});
      });
    });
  }

  decodeCert(cert) {
    this.chaincodeService.decodeCert(cert).then(o => {
      const formatter = new JSONFormatter(o);
      Home.output(formatter.render(), 'info');
    });
  }

  static output(inp, id) {
    const el = document.getElementById(id);
    if (el.firstChild === null)
      el.appendChild(inp);
    else
      el.removeChild(el.firstChild);
    el.appendChild(inp);
  }

  static parseBlock(block) {
    let action = block.data.actions;
    for (let i = 0; i < action.length; i++) {
      let payload = action[i].payload.chaincode_proposal_payload.input.chaincode_spec.input.args;
      let arr = [];
      for (let j = 0; j < payload.length; j++) {
        let str = "";
        for (let k = 0; k < payload[j].data.length; k++) {
          str += String.fromCharCode(payload[j].data[k])
        }
        arr.push(str);
      }
      const formatter = new JSONFormatter(arr);
      Home.output(formatter.render(), "input");
    }
    for (let i = 0; i < action.length; i++) {
      let payload = (action[i].payload.action.proposal_response_payload.extension.results.ns_rwset[1] && action[i].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes) || action[i].payload.action.proposal_response_payload.extension.results.ns_rwset[0].rwset.writes;
      for (let j = 0; j < payload.length; j++) {
        const formatter = new JSONFormatter(payload[j]);
        Home.output(formatter.render(), "writes");
      }
    }
    for (let i = 0; i < action.length; i++) {
      let payload = (action[i].payload.action.proposal_response_payload.extension.results.ns_rwset[1] && action[i].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.reads) || action[i].payload.action.proposal_response_payload.extension.results.ns_rwset[0].rwset.reads;
      for (let j = 0; j < payload.length; j++) {
        const formatter = new JSONFormatter(payload[j]);
        Home.output(formatter.render(), "reads");
      }
    }
  }
}
