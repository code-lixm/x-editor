<script lang="ts" setup>
import { onMounted, onUnmounted, ref, shallowReactive } from 'vue';
import {
  ComponentInstance,
  Subscription,
  RootComponentRef,
  auditTime,
  Renderer,
  merge,
  fromPromise,
  timeout,
  skip,
} from '@textbus/core';
import {
  createEditor,
  Editor,
  LinkJumpTipPlugin,
  Toolbar,
  TableComponentSelectionAwarenessDelegate,
  boldTool,
  cleanTool,
  colorTool,
  defaultGroupTool,
  fontFamilyTool,
  fontSizeTool,
  headingTool,
  historyBackTool,
  historyForwardTool,
  imageTool,
  italicTool,
  linkTool,
  olTool,
  strikeThroughTool,
  tableAddTool,
  tableRemoveTool,
  textAlignTool,
  textBackgroundTool,
  textIndentTool,
  ulTool,
  underlineTool,
  unlinkTool,
  ToolFactory,
  componentsTool,
  formatPainterTool,
} from '@textbus/editor';

import {
  collaborateModule,
  CollaborateSelectionAwarenessDelegate,
  RemoteSelection,
  Collaborate,
} from '@textbus/collaborate';
import { WebsocketProvider } from 'y-websocket';
import { fromEvent } from '@tanbo/stream';
import { Caret, CaretLimit } from '@textbus/browser';

import { i18nZhCN } from './config';

interface Header {
  component: ComponentInstance;
  highlight: boolean;
  nativeNode: HTMLElement;
}
interface User {
  color: string;
  name: string;
}

const toolbar = ref<HTMLElement>();
const editorWrapper = ref<HTMLElement>();

let editor: Editor;

const viewCollaborativeState = shallowReactive({
  users: [] as User[],
  headers: [] as Header[],
  isLoaded: false,
});

const customTools: ToolFactory[][] = [
  [defaultGroupTool, componentsTool],
  [historyBackTool, historyForwardTool, formatPainterTool, cleanTool],
  [headingTool, fontFamilyTool, fontSizeTool],
  [boldTool, italicTool, strikeThroughTool, underlineTool],
  [colorTool, textBackgroundTool],
  [textAlignTool],
  [textIndentTool],
  [olTool, ulTool],
  [linkTool, unlinkTool],
  [imageTool],
  [tableAddTool, tableRemoveTool],
  // [insertParagraphAfterTool, insertParagraphBeforeTool],
];

const subscriber = new Subscription();

// 更新左侧大纲标题
const updateHeader = (rootComponentRef: RootComponentRef, renderer: Renderer) => {
  const headers: Header[] = [];
  rootComponentRef.component.slots.toArray().forEach((slot) => {
    slot.sliceContent().forEach((i) => {
      if (typeof i === 'string') {
        return;
      }
      if (i.name === 'HeadingComponent') {
        const vNode = renderer.getVNodeByComponent(i)!;
        const nativeElement = renderer.getNativeNodeByVNode(vNode) as HTMLElement;
        headers.push({
          highlight: false,
          component: i,
          nativeNode: nativeElement,
        });
      }
    });
  });
  viewCollaborativeState.headers = headers;
};

// 跳转标题到指定位置
const toHeading = (item: Header) => {
  document.documentElement.scrollTop = item.nativeNode.offsetTop + 20;
};

onMounted(() => {
  editor = createEditor({
    theme: 'light',
    autoFocus: true,
    zenCoding: true,
    historyStackSize: 30,
    placeholder: '请输入',
    i18n: i18nZhCN,
    imports: [collaborateModule],
    providers: [
      {
        provide: CollaborateSelectionAwarenessDelegate,
        useClass: TableComponentSelectionAwarenessDelegate,
      },
    ],
    plugins: [() => new Toolbar(customTools, toolbar.value!), () => new LinkJumpTipPlugin()],
    async setup(injector) {
      const collaborate = injector.get(Collaborate);
      const caret = injector.get(Caret);

      caret.correctScrollTop({
        onScroll: fromEvent(document, 'scroll'),
        getLimit(): CaretLimit {
          return {
            top: 116,
            bottom: document.documentElement.clientHeight,
          };
        },
        setOffset(offsetScrollTop: number) {
          document.documentElement.scrollTop += offsetScrollTop;
        },
      });

      const ws = `wss://blog.bilent.top:9999/api/`;
      const provide = new WebsocketProvider(ws, 'collaboration', collaborate.yDoc);

      const nanoId = ~~(Math.random() * 1000000);

      const username = '游客-' + nanoId;
      const colors = [
        '#47A1FF',
        '#59CB74',
        '#FFB952',
        '#FC6980',
        '#6367EC',
        '#DA65CC',
        '#FBD54A',
        '#ADDF84',
        '#6CD3FF',
        '#659AEC',
        '#9F8CF1',
        '#ED8CCE',
        '#A2E5FF',
        '#4DCCCB',
        '#F79452',
        '#84E0BE',
        '#5982F6',
        '#E37474',
        '#3FDDC7',
        '#9861E5',
      ];

      const user: User = {
        name: username,
        color: colors[~~[Math.random() * colors.length]],
      };

      provide.awareness.setLocalStateField('user', user);

      const subscription = collaborate.onSelectionChange.subscribe((paths) => {
        const localSelection: RemoteSelection = {
          username: user.name,
          color: user.color,
          paths,
          id: Math.random().toString(16),
        };
        provide.awareness.setLocalStateField('selection', localSelection);
      });

      provide.awareness.on('update', () => {
        const users: User[] = [];
        const remoteSelections: RemoteSelection[] = [];
        provide.awareness.getStates().forEach((state) => {
          if (state.user) {
            users.push(state.user);
          }
          if (state.selection) {
            remoteSelections.push(state.selection);
          }
        });

        const selections = remoteSelections.filter((i) => i.username !== user.name);

        collaborate.updateRemoteSelection(selections);
        viewCollaborativeState.users = users;
      });
      return new Promise<() => void>((resolve) => {
        provide.on('sync', (is: boolean) => {
          if (is) {
            resolve(() => {
              provide.disconnect();
              subscription.unsubscribe();
            });
          }
        });
      });
    },
  });
  const { injector } = editor;
  const renderer = injector.get(Renderer);
  subscriber.add(
    merge(
      fromPromise(
        editor.mount(editorWrapper.value!).then(() => {
          const rootComponentRef = injector.get(RootComponentRef);
          updateHeader(rootComponentRef, renderer);
          subscriber.add(
            editor.onChange.subscribe(() => {
              updateHeader(rootComponentRef, renderer);
            }),
          );
        }),
      ),
      timeout(300),
    )
      .pipe(skip(1))
      .subscribe(() => {
        viewCollaborativeState.isLoaded = true;
      }),
  );
  subscriber.add(
    fromEvent(document, 'scroll')
      .pipe(auditTime(100))
      .subscribe(() => {
        let current: Header | null = null;
        viewCollaborativeState.headers.forEach((h) => {
          const rect = h.nativeNode.getBoundingClientRect();
          h.highlight = false;
          if (rect.top < 120) {
            current = h;
          }
        });
        if (!current) {
          current = viewCollaborativeState.headers[0];
        }
        if (current) {
          current.highlight = true;
        }
        viewCollaborativeState.headers = viewCollaborativeState.headers.slice();
      }),
  );
});

onUnmounted(() => {
  editor.destroy();
  subscriber.unsubscribe();
});
</script>
<template>
  <div ref="toolbar" class="toolbar"></div>
  <div class="editor-bg">
    <div class="editor-container ui-container">
      <div class="left">
        <div class="outlines">
          <ul>
            <li
              v-for="(item, index) in viewCollaborativeState.headers"
              :key="index"
              :class="{
                ['level-' + item.component.state]: true,
                active: item.highlight,
              }"
            >
              <span></span><a href="javascript:;" @click="toHeading(item)">{{ item.component.toString() }}</a>
            </li>
          </ul>
        </div>
      </div>
      <div class="middle">
        <div
          ref="editorWrapper"
          class="editor-wrapper"
          :style="{
            visibility: viewCollaborativeState.isLoaded ? 'visible' : 'hidden',
          }"
        ></div>
        <div v-if="!viewCollaborativeState.isLoaded" class="spinner">
          <div class="rect1"></div>
          <div class="rect2"></div>
          <div class="rect3"></div>
          <div class="rect4"></div>
          <div class="rect5"></div>
        </div>
      </div>
      <div class="right">
        <div
          class="users"
          :style="{
            visibility: viewCollaborativeState.isLoaded ? 'visible' : 'hidden',
          }"
        >
          <div v-for="item in viewCollaborativeState.users" :key="item.color" :style="{ background: item.color }">
            {{ item.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style lang="scss" scoped>
.spinner {
  position: absolute;
  left: 50%;
  top: 50%;
  margin-left: -25px;
  width: 50px;
  height: 40px;
  text-align: center;
}

.spinner > div {
  background-color: $color-primary;
  height: 100%;
  width: 5px;
  margin-left: 1px;
  margin-right: 1px;
  display: inline-block;

  animation: loading 1.2s infinite ease-in-out;
}

.spinner .rect2 {
  animation-delay: -1.1s;
}

.spinner .rect3 {
  animation-delay: -1s;
}

.spinner .rect4 {
  animation-delay: -0.9s;
}

.spinner .rect5 {
  animation-delay: -0.8s;
}

@-webkit-keyframes loading {
  0%,
  40%,
  100% {
    transform: scaleY(0.4);
  }
  20% {
    transform: scaleY(1);
  }
}

@keyframes loading {
  0%,
  40%,
  100% {
    transform: scaleY(0.4);
  }
  20% {
    transform: scaleY(1);
  }
}

.outlines {
  position: sticky;
  top: 160px;
  font-size: 14px;

  ul {
    list-style: none;
    padding-left: 5px;
  }

  li {
    position: relative;
    padding: 3px 0;
    &.active {
      a {
        color: $color-primary;
      }

      span {
        background: $color-primary;
      }
    }

    &:before {
      content: '';
      width: 1px;
      position: absolute;
      left: 0;
      top: 50%;
      height: 100%;
      transform: translateX(-50%);
      background-color: $color-gray;
    }

    &:last-child {
      &:before {
        display: none;
      }
    }

    span {
      position: absolute;
      left: 0;
      top: 50%;
      display: inline-block;
      border-radius: 50%;
      background-color: $color-gray-dark;
      transform: translate(-50%, -50%);
    }

    &.level-h1 {
      padding-left: 10px;

      span {
        width: 7px;
        height: 7px;
      }
    }

    &.level-h2 {
      padding-left: 15px;

      span {
        width: 5px;
        height: 5px;
      }
    }

    &.level-h3 {
      padding-left: 20px;

      span {
        width: 3px;
        height: 3px;
      }
    }

    &.level-h4 {
      padding-left: 25px;

      span {
        width: 3px;
        height: 3px;
      }
    }

    &.level-h5 {
      padding-left: 30px;

      span {
        width: 3px;
        height: 3px;
      }
    }

    &.level-h6 {
      padding-left: 35px;

      span {
        width: 3px;
        height: 3px;
      }
    }
  }

  a {
    display: block;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    color: $color-gray-dark;
    text-decoration: none;
    border-radius: 4px;
    padding: 6px 10px;

    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
      color: $color-primary;
    }
  }
}

.users {
  padding-top: 10px;
  padding-bottom: 10px;
  height: 50px;
  color: #fff;
  line-height: 30px;
  position: sticky;
  top: 160px;

  > div {
    white-space: nowrap;
    margin: 0 3px;
    width: 30px;
    height: 30px;
    font-size: 12px;
    text-align: center;
    overflow: hidden;
    border-radius: 50%;
    display: inline-block;
  }
}

.toolbar {
  text-align: center;
  position: sticky;
  top: 0px;
  z-index: 20;
  :deep(.textbus-toolbar) {
    .tanbo-color-picker-swatches > div {
      border-radius: 4px;
    }
    .textbus-toolbar-button-active {
      background-color: rgba(0, 0, 0, 0.05);
    }
    .textbus-toolbar-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      padding: 0;
      .textbus-toolbar-group {
        margin: 0;
        padding: 4px;
        border-radius: 0;
        border-left: 1px solid rgba(0, 0, 0, 0.05);

        &:first-child {
          border: none;
        }
        .textbus-toolbar-dropdown-open {
          .textbus-toolbar-button {
            background-color: rgba(0, 0, 0, 0.05);
          }
        }
        .textbus-toolbar-dropdown-menu {
          background: #fff;
          top: 35px;
          box-shadow: 1px 1px 3px rgb(0 0 0 / 5%);
        }
        .textbus-toolbar-button {
          &:focus {
            box-shadow: none;
          }
          &[title='段落与标题'] {
            width: 60px;
            span {
              font-size: 12px;
              text-align: center;
            }
          }
          &[title='字体'] {
            width: 80px;
            span {
              font-size: 12px;
              text-align: center;
            }
          }
          &[title='字体大小'] {
            width: 48px;
            span {
              font-size: 12px;
              text-align: center;
            }
          }
          &[title='对齐方式'] {
            width: 70px;
            span {
              font-size: 12px;
              text-align: center;
            }
          }
        }

        .textbus-toolbar-dropdown {
          padding-left: 4px;
          &:first-child {
            padding-left: 0;
          }
        }

        .textbus-toolbar-item {
          padding-left: 4px;
          &:first-child {
            padding-left: 0;
          }
        }
      }
    }
  }
}

.editor-bg {
  height: calc(100% - 40px);
}

.editor-container {
  padding-top: 30px;
  display: flex;
  height: calc(100vh - 40px);
}

.left {
  width: 220px;
  padding-right: 20px;
}

.middle {
  flex: 1;
  position: relative;
}

.right {
  padding-left: 20px;
  width: 220px;
}

.editor-wrapper {
  margin: 0 auto;
}

:deep {
  .textbus-container {
    height: calc(100vh - 100px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .textbus-ui-middle {
    border-width: 0;
  }

  .textbus-toolbar-wrapper {
    border-width: 0 !important;
  }

  .textbus-toolbar-group {
    float: none;
    display: inline-block;
  }

  [textbus-document] {
    padding: 20px !important;
  }
}

.alert {
  padding-top: 15px;
  padding-bottom: 15px;
  line-height: 1.5;

  span {
    color: $color-danger;
  }
}
</style>
<style lang="scss">
.textbus-contextmenu {
  .textbus-contextmenu-item {
    .textbus-icon-table-remove {
      transform: scale(0.9);
      display: block;
      position: relative;
      top: 4px;
    }
    .textbus-icon-select {
      position: relative;
      top: 2px;
    }
    .textbus-icon-insert-paragraph-before {
      position: relative;
      top: 2px;
    }
    .textbus-icon-insert-paragraph-after {
      position: relative;
      top: 2px;
    }
  }
}
.textbus-container {
  ul {
    display: block;
    list-style: disc;
    margin-block-start: 1em;
    margin-block-end: 1em;
    margin-inline-start: 0px;
    margin-inline-end: 0px;
    padding-inline-start: 40px;
    li {
      list-style: inherit;
    }
  }
}
.tb-code-line::before {
  box-sizing: content-box;
}
.tb-jumbotron-setting {
  padding: 3px 2px;
}
</style>
