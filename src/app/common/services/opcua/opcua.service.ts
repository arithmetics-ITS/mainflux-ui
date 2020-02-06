import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from 'environments/environment';
import { OpcuaNode } from 'app/common/interfaces/opcua.interface';
import { ThingsService } from 'app/common/services/things/things.service';
import { ChannelsService } from 'app/common/services/channels/channels.service';
import { NotificationsService } from 'app/common/services/notifications/notifications.service';

@Injectable()
export class OpcuaService {
  typeOpcua = 'opcua';
  typeOpcuaServer = 'OPC-UA-Server';

  constructor(
    private http: HttpClient,
    private thingsService: ThingsService,
    private channelsService: ChannelsService,
    private notificationsService: NotificationsService,
  ) { }

  getNode(id: string) {
    return this.thingsService.getThing(id);
  }

  getNodes(offset: number, limit: number) {
    return this.thingsService.getThings(offset, limit, this.typeOpcua);
  }

  addNodes(serverURI: string, nodes: any) {
    // Check if a channel exist for serverURI
    return this.channelsService.getChannels(0, 1, 'opcua', `{"serverURI": "${serverURI}"}`).map(
      (resp: any) => {
        if (resp.total === 0) {
          const chanReq = {
            name: `${this.typeOpcuaServer}`,
            metadata: {
              type: this.typeOpcua,
              opcua: {
                serverURI: serverURI,
              },
            },
          };

          this.channelsService.addChannel(chanReq).subscribe(
            respChan => {
              const chanID = respChan.headers.get('location').replace('/channels/', '');
              this.addAndConnect(chanID, nodes);
            },
          );
        } else {
          const chanID = resp.channels[0].id;
          this.addAndConnect(chanID, nodes);
        }
      },
    );
  }

  addAndConnect(chanID: string, nodes: any) {
    const nodesReq: OpcuaNode[] = [];
    nodes.forEach(node => {
      const nodeReq: OpcuaNode = {
        name: node.name,
        metadata: {
          type: this.typeOpcua,
          opcua: {
            nodeID: node.nodeID,
            serverURI: node.serverURI,
          },
          channelID: chanID,
        },
      };
      nodesReq.push(nodeReq);
    });

    this.thingsService.addThings(nodesReq).subscribe(
      (respThings: any) => {
        const channels = [chanID];
        const nodesIDs = respThings.body.things.map( thing => thing.id);
        this.channelsService.connectThings(channels, nodesIDs).subscribe(
          respCon => {
            this.notificationsService.success('OPC-UA Nodes successfully created', '');
          },
          err => {
            nodesIDs.forEach( id => {
              this.thingsService.deleteThing(id).subscribe();
            });
          },
        );
      },
    );
  }

  editNode(node: any) {
    const nodeReq: OpcuaNode = {
      id: node.id,
      name: node.name,
      metadata: {
        type: this.typeOpcua,
        opcua: {
          serverURI: node.serverURI,
          nodeID: node.nodeID,
        },
      },
    };

    return this.thingsService.editThing(nodeReq).map(
      resp => {
        this.notificationsService.success('OPC-UA Node successfully edited', '');
      },
    );
  }

  deleteNode(node: any) {
    return this.thingsService.deleteThing(node.id).map(
      respThing => {
        const serverURI = node.metadata.opcua.serverURI;
        this.thingsService.getThings(0, 1, 'opcua', `{"serverURI": "${serverURI}"}`).subscribe(
          (respChan: any) => {
            if (respChan.total === 0) {
              const channelID = node.metadata.channelID;
              this.channelsService.deleteChannel(channelID).subscribe();
            }
          },
        );
        this.notificationsService.success('OPC-UA Node successfully deleted', '');
      },
    );
  }

  browseServerNodes(uri: string, ns: string, id: string) {
    const params = new HttpParams()
      .set('server', uri)
      .set('namespace', ns)
      .set('identifier', id);

    return this.http.get(environment.browseUrl, { params })
      .map(
        resp => {
          this.notificationsService.success('OPC-UA browsing finished', '');
          return resp;
        },
      )
      .catch(
        err => {
          this.notificationsService.error('Failed to Browse',
            `Error: ${err.status} - ${err.statusText}`);
          return Observable.throw(err);
        },
      );
  }
}
