<template>
    <el-dialog v-model="productStore.showProduct" :show-close="false" width="800">
        <template #header="{ close }">
            <div class="my-header">
                <el-text size="large" style="font-size: 20px" type="info">产品列表</el-text>
                <el-button type="warning" @click="close">
                    <el-icon class="el-icon--left">
                        <CircleCloseFilled/>
                    </el-icon>
                    关闭
                </el-button>
            </div>

            <!--已购买产品-->
            <div v-show="buyProductList.length>0">
                <br>
                <h3>我的产品列表</h3>
                <br>
                <el-table v-show="buyProductList.length>0" :data="buyProductList" stripe style="width: 100%">
                    <el-table-column prop="productName" label="产品" width="180">
                        <template v-slot="{ row }">
                            <span :style="{ textDecoration: isExpired(row) ? 'line-through' : 'none' }">
                                {{ row.productName }}
                            </span>
                        </template>
                    </el-table-column>

                    <!-- 状态列 -->
                    <el-table-column label="状态" width="100">
                        <template v-slot="{ row }">
                            <span :style="{ color: isExpired(row) ? 'red' : 'green' }">
                                {{ isExpired(row) ? '过期' : '正常' }}
                            </span>
                        </template>
                    </el-table-column>

                    <el-table-column prop="powerList" label="能力" width="180">
                        <template v-slot="{ row }">
                            <div v-for="power in row.powerList" :key="power">
                                <el-tag effect="dark" :type="randomStyle()" size="small">{{ power }}</el-tag>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column prop="periodOfValidityStartTime" label="有效期开始时间"/>
                    <el-table-column prop="periodOfValidityEndTime" label="有效期结束时间"/>
                </el-table>
                <br>
            </div>

            <el-empty v-show="!buyProductList?.length" :image-size="50" description="暂无产品记录；本地自托管版本已开放全部能力"/>

        </template>
    </el-dialog>
</template>

<script setup lang="ts">

import {CircleCloseFilled} from "../icons";
import {inject, ref, watch} from "vue";
import {AxiosInstance} from "axios";
import {ProductStore} from "../../stores";

const productStore = ProductStore()

const axios = inject('$axios') as AxiosInstance

// 已经购买产品
const buyProductList = ref([])

// --------------------------------------------------函数定义-------------------------------------------------------------

const isExpired = (row: any): boolean => {
    const currentTime = new Date();
    const endTime = new Date(row.periodOfValidityEndTime);
    return currentTime > endTime;
}


const randomStyle = (): string => {
    const tagStyleArr = ['primary', 'warning', 'success', 'danger']
    let number = Math.floor(Math.random() * 4);
    return tagStyleArr[number];
}


// --------------------------------------------------函数定义-------------------------------------------------------------


const queryBuyProductList = async () => {
    // 已购买产品集合
    let productResp = await axios.post("/api/product/user/product/list")
    buyProductList.value = productResp.data.data
}

const openProductDialog = async () => {

    // if (buyProductList.value.length <= 0) {
    // }
    await queryBuyProductList()

}


watch(
    () => productStore.showProduct,
    (newVal) => {
        if (newVal) {
            openProductDialog()
        }
    }
);


</script>

<style scoped>
.my-header {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 16px;
}
</style>
