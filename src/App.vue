<script setup lang="ts">
import zhCn from 'element-plus/lib/locale/lang/zh-cn';

const locale = zhCn;
</script>

<template>
  <el-config-provider :locale="locale">
    <router-view></router-view>
  </el-config-provider>
</template>
<style lang="scss">
#app {
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif,
    'Segoe UI';
}
</style>
