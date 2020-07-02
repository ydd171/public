/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { Steps, Collapse, PageHeader, Spin, Tag, Button, Icon } from 'antd';
import http from 'libs/http';
import { AuthDiv } from 'components';
import history from 'libs/history';
import styles from './index.module.css';
import store from './store';
import lds from 'lodash';

@observer
class Ext1Index extends React.Component {
  constructor(props) {
    super(props);
    this.id = props.match.params.id;
    this.log = props.match.params.log;
    this.elements = {};
    this.state = {
      fetching: true,
      loading: false,
      request: {},
    }
  }

  componentDidMount() {
    this.fetch()
  }

  componentWillUnmount() {
    if (this.socket) this.socket.close();
    store.request = {targets: [], host_actions: [], server_actions: []};
    store.outputs = {};
  }

  fetch = () => {
    this.setState({fetching: true});
    http.get(`/api/deploy/request/${this.id}/`, {params: {log: this.log}})
      .then(res => {
        store.request = res;
        store.outputs = {};
        while (res.outputs.length) {
          const msg = JSON.parse(res.outputs.pop());
          if (!store.outputs.hasOwnProperty(msg.key)) {
            const data = msg.key === 'local' ? '读取数据...        ' : '';
            store.outputs[msg.key] = {data}
          }
          this._parse_message(msg)
        }
      })
      .finally(() => this.setState({fetching: false}))
  };

  _parse_message = (message) => {
    const {key, data, step, status} = message;
    if (data !== undefined) {
      store.outputs[key]['data'] += data;
      if (this.elements[key]) this.elements[key].scrollIntoView()
    }
    if (step !== undefined) store.outputs[key]['step'] = step;
    if (status !== undefined) store.outputs[key]['status'] = status;
  };

  handleDeploy = () => {
    this.setState({loading: true});
    http.post(`/api/deploy/request/${this.id}/`)
      .then(({token, outputs}) => {
        store.request.status = '2';
        store.outputs = outputs;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/exec/${token}/`);
        this.socket.onopen = () => {
          this.socket.send('ok');
        };
        this.socket.onmessage = e => {
          if (e.data === 'pong') {
            this.socket.send('ping')
          } else {
            this._parse_message(JSON.parse(e.data))
          }
        }
      })
      .finally(() => this.setState({loading: false}))
  };

  getStatus = (key, n) => {
    const step = lds.get(store.outputs, `${key}.step`, -1);
    const isError = lds.get(store.outputs, `${key}.status`) === 'error';
    const icon = <Icon type="loading"/>;
    if (n > step) {
      return {key: n, status: 'wait'}
    } else if (n === step) {
      return isError ? {key: n, status: 'error'} : {key: n, status: 'process', icon}
    } else {
      return {key: n, status: 'finish'}
    }
  };

  getStatusAlias = () => {
    if (Object.keys(store.outputs).length !== 0) {
      for (let item of [{id: 'local'}, ...store.request.targets]) {
        if (lds.get(store.outputs, `${item.id}.status`) === 'error') {
          return <Tag color="red">发布异常</Tag>
        } else if (lds.get(store.outputs, `${item.id}.step`, -1) < 5) {
          return <Tag color="blue">发布中</Tag>
        }
      }
      return <Tag color="green">发布成功</Tag>
    } else {
      return <Tag>{store.request['status_alias'] || '...'}</Tag>
    }
  };

  render() {
    const {app_name, env_name, status} = store.request;
    return (
      <AuthDiv auth="deploy.request.do">
        <Spin spinning={this.state.fetching}>
          <PageHeader
            title="应用发布"
            subTitle={`${app_name} - ${env_name}`}
            style={{padding: 0}}
            tags={this.getStatusAlias()}
            extra={this.log ? (
              <Button icon="sync" type="primary" onClick={this.fetch}>刷新</Button>
            ) : (
              <Button icon="play-circle" loading={this.state.loading} type="primary"
                      disabled={!['1', '-3'].includes(status)}
                      onClick={this.handleDeploy}>发布</Button>
            )}
            onBack={() => history.goBack()}/>
          <Collapse defaultActiveKey={1} className={styles.collapse}>
            <Collapse.Panel showArrow={false} key={1} header={
              <Steps>
                <Steps.Step {...this.getStatus('local', 0)} title="建立连接"/>
                <Steps.Step {...this.getStatus('local', 1)} title="发布准备"/>
                <Steps.Step {...this.getStatus('local', 2)} title="检出前任务"/>
                <Steps.Step {...this.getStatus('local', 3)} title="执行检出"/>
                <Steps.Step {...this.getStatus('local', 4)} title="检出后任务"/>
                <Steps.Step {...this.getStatus('local', 5)} title="执行打包"/>
              </Steps>}>
              <pre className={styles.ext1Console}>
                {lds.get(store.outputs, 'local.data')}
                <div ref={el => this.elements['local'] = el}/>
              </pre>
            </Collapse.Panel>
          </Collapse>

          <Collapse
            defaultActiveKey={'0'}
            className={styles.collapse}
            expandIcon={({isActive}) => <Icon type="caret-right" style={{fontSize: 16}} rotate={isActive ? 90 : 0}/>}>
            {store.request.targets.map((item, index) => (
              <Collapse.Panel key={index} header={
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <b>{item.title}</b>
                  <Steps size="small" style={{maxWidth: 600}}>
                    <Steps.Step {...this.getStatus(item.id, 1)} title="数据准备"/>
                    <Steps.Step {...this.getStatus(item.id, 2)} title="发布前任务"/>
                    <Steps.Step {...this.getStatus(item.id, 3)} title="执行发布"/>
                    <Steps.Step {...this.getStatus(item.id, 4)} title="发布后任务"/>
                  </Steps>
                </div>}>
                <pre className={styles.ext1Console}>
                  {lds.get(store.outputs, `${item.id}.data`)}
                  <div ref={el => this.elements[item.id] = el} />
                </pre>
              </Collapse.Panel>
            ))}
          </Collapse>
        </Spin>
      </AuthDiv>
    )
  }
}

export default Ext1Index
