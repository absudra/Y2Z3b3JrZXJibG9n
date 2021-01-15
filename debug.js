/**
 * Created with JetBrains WebStorm.
 * User: cangya.jyt
 * Date: 13-11-21
 * Time: 上午11:25
 * To change this template use File | Settings | File Templates.
 */

function toPriceInt(str) {
    return parseInt((str + '00').replace(/\.([\d]{2})[\d]*$/, '$1'));
}

function toPriceStr(num) {
    var tmp = Math.abs(num),
        str = "" + tmp;
    if (tmp < 1) {
        tmp = 1;
    }
    if (tmp < 100) {
        str = (str.length == 1 ? '0.0' : '0.') + str;
    } else {
        str = str.replace(/([\d]{2})$/, '.$1');
    }
    return (num < 0 ? '-' : '') + str;
}
/**
 * Created by comcow on 13-11-9.
 */
var cache = (function(){
    var db = openDatabase("trade", '1.0', '', 100*1024*1024);
    db.transaction(function (tx) {
        tx.executeSql('CREATE TABLE IF NOT EXISTS cache (tid unique, trade, time_stamp)');
        tx.executeSql('DELETE FROM cache WHERE time_stamp < ?', [new Date().getTime - 30*60*1000]);
    });
    db.transaction(function (tx) {
        tx.executeSql('CREATE TABLE IF NOT EXISTS url_cache (num_iid unique, url, time_stamp)');
        tx.executeSql('DELETE FROM url_cache WHERE time_stamp < ?', [new Date().getTime - 15*24*60*60*1000]);
    });

    return {
        "cacheTrade" : function(tid, trade) {
            db.transaction(function(tx){
                tx.executeSql(
                    "INSERT INTO cache (tid, trade, time_stamp) values (?, ?, ?)",
                    [tid, JSON.stringify(trade), new Date().getTime()],
                    null,
                    function(tx, error){
                        tx.executeSql("UPDATE cache SET trade=?,time_stamp=? WHERE tid=? ",
                            [JSON.stringify(trade), new Date().getTime(), tid]);
                    });
            });
        },
        "getTrade" : function(tid, success, error) {
            db.transaction(function(tx){
                tx.executeSql("SELECT * FROM cache WHERE tid=?", [tid],
                    function(tx, result){
                        if (result.rows.length > 0) {
                            if (_.isFunction(success)) {
                                success(JSON.parse(result.rows.item(0).trade));
                            }
                        } else {
                            if (_.isFunction(error)) {
                                error();
                            }
                        }
                    },
                    function(){
                        _.isFunction(error) && error();
                    });
            });
        },
        "cacheUrl" : function(num_iid, url) {
            db.transaction(function(tx){
                tx.executeSql(
                    "INSERT INTO url_cache (num_iid, url, time_stamp) values (?, ?, ?)",
                    [num_iid, url, new Date().getTime()],
                    null,
                    function(tx){
                        tx.executeSql("UPDATE url_cache SET url=?,time_stamp=? WHERE num_iid=? ",
                            [url, new Date().getTime(), num_iid]);
                    });
            });
        },
        "getUrl" : function(num_iid, success, error) {
            db.transaction(function(tx){
                tx.executeSql("SELECT * FROM url_cache WHERE num_iid=?", [num_iid],
                    function(tx, result){
                        if (result.rows.length > 0) {
                            if (_.isFunction(success)) {
                                success(result.rows.item(0).url);
                            }
                        } else {
                            if (_.isFunction(error)) {
                                error();
                            }
                        }
                    },
                    function(){
                        _.isFunction(error) && error();
                    });
            });
        },
        "clear" : function(callback) {
            db.transaction(function (tx) {
                tx.executeSql('DELETE FROM cache WHERE 1=1');
                tx.executeSql('DELETE FROM url_cache WHERE 1=1');
                if (typeof callback == "function") {
                    callback();
                }
            });
        }
    }
})();
/**
 * Created with JetBrains WebStorm.
 * User: cangya.jyt
 * Date: 13-11-28
 * Time: 上午9:44
 * To change this template use File | Settings | File Templates.
 */
var LoadingModule = function(sandbox) {
    var dom = $('#J_loading'),times = 0,loading = false, gap = 1000, focusSn = -1, baseTime  ;

    function tagStart(sn) {
        if (focusSn == -1) {
            focusSn = sn;
            baseTime = new Date().getTime();
        }
    }

    function tagDone(sn) {
        if (focusSn == sn) {
            gap = gap * 0.4 + ((new Date().getTime()) - baseTime)* 0.6;
            focusSn = -1;
        }
    }

    return {
        init: function() {
            sandbox.on("topLoading", function(sn){
                loading = true;
                tagStart(sn);
                setTimeout(function(){
                    if (loading && gap > 500) {
                        dom.fadeIn(100);
                    }
                },300);
                times ++;
            });
            sandbox.on("topDone", function(sn){
                loading = false;
                times--;
                times = times < 0 ? 0 : times;
                tagDone(sn);
                if (times == 0) {
                    dom.fadeOut(100);
                }
            });
        }
    }
}
/**
 * Created by comcow on 13-11-9.
 */

/*
base structure:
{
tid: "",
status: "",
modified, "",
orders: [],
created: ""
}


 */

var _extModelFidlds = "tid,seller_memo,buyer_message,seller_nick, buyer_nick, title, type, payment, pay_time, discount_fee, adjust_fee, post_fee, total_fee, created, modified, pic_path, num_iid, num, price,  receiver_name, receiver_state, receiver_city, receiver_district, receiver_address, receiver_zip,receiver_mobile, receiver_phone,seller_flag,buyer_area,has_buyer_message,trade_source,send_time,promotion_details,orders,buyer_alipay_no, status, timeout_action_time";

var TradeModel = Backbone.Model.extend({
    getLatestInfo: function(trade){
        var self = this,
            def = $.Deferred();
        QN.top.invoke({
            cmd: "taobao.trade.fullinfo.get",
            param: {
                fields: _extModelFidlds,
                tid: trade.tid
            }
        }).done(function(rsp) {
                alert(trade.tid);
                console.log('taobao.trade.fullinfo.get -> tid:' + trade.tid, rsp);
                def.resolve(self.parse(rsp));
            });
        return def;
    },
    fetch: function(){
        var self = this;
        cache.getTrade(self.get("tid"),
            function(t){
                if (t.modified == self.get("modified")) {
                    self.set(t);
                    self.trigger("refreshAll");
                } else {
                    self.getLatestInfo(self.toJSON())
                        .done(function(data) {
                            // var orders = [];
                            // _.each(data.orders, function(curr, key){
                            //     if(curr.status !== 'TRADE_CLOSED_BY_TAOBAO'){
                            //         orders.push(curr);
                            //     }
                            // })
                            // data.orders = orders;
                            self.set(data);
                            self.trigger("refreshAll");
                        });
                }
            },
            function() {
                self.getLatestInfo(self.toJSON())
                    .done(function(data) {
                        self.set(data);
                        self.trigger("refreshAll");
                    });
            }
        );
    },
    fetchContent: function(){
        var self = this;
        self.getLatestInfo(self.toJSON())
            .done(function(data) {
                self.set(data);
                self.trigger("refreshContent");
            });
    },
    parse: function(data){
        var self = this,
            extTrade = data.trade_fullinfo_get_response.trade,
            trade = self.toJSON(),
            orders = extTrade.orders.order,
            prom = extTrade.promotion_details;

        _.each(orders, function(e){
            if (e.sku_properties_name){
                e.sku_properties_name = e.sku_properties_name.replace(/[^;]*:/g, "");
            }
            var part = e.part_mjz_discount = toPriceInt(e.part_mjz_discount || 0),
                discount = e.discount_fee = toPriceInt(e.discount_fee),
                adjust = e.adjust_fee = toPriceInt(e.adjust_fee),
                total_price = toPriceInt(e.price) * e.num;
            e.total_price = toPriceStr(total_price);
            e.adjust_fee_show = toPriceStr(adjust - part - discount);
            e.discount_rate = ((total_price + adjust - part - discount) / total_price * 10).toFixed(2);
            e.from_taobao = global.fromTaobao;
        });

        trade = _.extend(trade, extTrade);
        trade.orders = orders;
        trade.editing = false;
        trade.promotion_details = prom && prom.promotion_detail;
        trade.address = _.extend({editing: false, editable: trade.status == "WAIT_SELLER_SEND_GOODS"},
            _.pick(trade, "tid", "receiver_name", "receiver_state", "receiver_city", "receiver_district",  "receiver_address", "receiver_zip", "receiver_mobile", "receiver_phone"));
        trade = _.omit(trade,
            "receiver_name",
            "receiver_state",
            "receiver_city",
            "receiver_district",
            "receiver_address",
            "receiver_zip",
            "receiver_mobile",
            "receiver_phone"
        );
        cache.cacheTrade(trade.tid, trade);
        return trade;
    },
    startEdit: function() {
        this.set("editing", true);
        this.trigger("startEdit");
    },
    cancelEdit: function() {
        this.set("editing", false);
        this.trigger("cancelEdit");
    },
    initialize: function() {
        this.fetch();
    }
});
/**
 * Created by comcow on 13-11-9.
 */

var TradeModule = function(sandbox) {
    var __activeStatus__ = ["WAIT_BUYER_PAY", "WAIT_SELLER_SEND_GOODS", "SELLER_CONSIGNED_PART", "WAIT_BUYER_CONFIRM_GOODS", "TRADE_BUYER_SIGNED"];

    function onError(rsp) {
        console.log(rsp);
        sandbox.emit("toast", rsp.sub_msg || "系统繁忙，请稍后再试");
    }

    var TradeView = Backbone.View.extend(
        _.extend({
            model: TradeModel,
            tagName: 'div',
            className: 'order-info drop-box J_dropBox',
            mainTmpl: template.compile($("#J_tradeMainTmpl").html()),
            ordersTmpl: template.compile($("#J_tradeContentTmpl").html()),
            initialize: function() {
                var self = this,  model = self.model, renderContent = self.renderContent;
                this.listenTo(model, "refreshAll",     self.renderAll);
                this.listenTo(model, "refreshContent", renderContent);
                this.listenTo(model, "startEdit",      renderContent);
                this.listenTo(model, "cancelEdit",     renderContent);
                this.listenTo(model, "destroy",        this.remove);

                if (__activeStatus__.indexOf(this.model.get("status")) > -1 ) {
                    this.$el.addClass("extend");
                } else {
                    this.$el.addClass("fixed");
                }
                this.renderFrame();
            },
            renderAll: function() {
                this.renderFrame()
                    .renderContent();
            },
            renderFrame: function() {
                this.$el.html(this.mainTmpl(this.model.toJSON()));
                this.bodyContainer = this.$(".J_content");
                return this;
            },
            renderContent: function() {
                this.bodyContainer.html(this.ordersTmpl(this.model.toJSON()));
                return this;
            },
            focusTo: function($target) {
                QN.application.invoke({
                    cmd: 'getFocus',
                    success: function() {$target.focus();}
                });
                return this;
            }
        },{
            priceReg: /^-?\d+(\.[\d]*)?$/,
            msgTmpl: template.compile($("#J_buyerMsgTmpl").html()),
            memoTipTmpl: template.compile($("#J_memoTipTmpl").html()),
            events: {
                "click .J_edit": "startEditPrice",
                "click .J_cancel": "cancelEditPrice",
                "click .J_save": "saveEditPrice",
                'click .J_quickTrigger': 'startQuickEdit',
                'click .J_quickOK': 'confirmQuickEdit',
                "click .J_openTradePlugin": "openTradePlugin",
                "click .J_showAddress": "showAddress",
                "click .J_urge": "urge",
                "click .J_closeTrade": "closeTrade",
                "click .J_memo": "showMemo",
                "click .J_goAlipay": "goAlipay",
                "click .J_itemImgUrl": "sendLink",
                "click .J_title": "jumpLink",
                "click .J_titleSku": "sendSku",
                "mouseenter .J_memo": "showMemoTip",
                "mouseleave .J_memo": "hideTip",
                "click .J_buyerMsg": "showMsg",
                "mouseenter .J_buyerMsg": "showMsgTip",
                "mouseleave .J_buyerMsg": "hideTip",
                "click .J_sendGood": "openTradePlugin",
                "click .J_trace": "showTraceInfo",
                "click .J_delay": "delay",
                "keyup .J_price": "priceUpdate",
                "keyup .J_discount": "discountUpdate",
                "keyup .J_postFee": "postFeeUpdate"
            },
            startEditPrice: function() {
                // var self = this;
                // 改价框隐藏，呼起改价组件
                this.model.startEdit();
                // QN.application.invoke( {
                //     cmd : 'updatePrice',
                //     param : {
                //         tid : this.model.get('tid')  
                                        
                //     },
                //     error : function(msg, cmd, param) {
                //        console.log('呼起改价组件失败')
                //     },
                //     success : function(rsp, cmd, param) {
                //         console.log('呼起改价组件成功')
                //         self.model.fetchContent();
                //     }
                    
                // });
                this.$el.find('.J_quickForm').hide();
                return this;
            },
            cancelEditPrice: function() {
                this.model.cancelEdit();
            },
            saveEditPrice: function() {

                var ids = [], fees = [], self = this, valid = true,
                    reg = /^[+-]{0,1}[\d]+([\.][\d]{0,2}){0,1}$/,
                    post = self.$(".J_postFee").val(),
                    errorMsg = '请正确填写价格';
                _.each(self.$(".J_price"), function(elem, key){
                    elem = $(elem);
                    var adj = elem.val();

                    if (!reg.test(adj)) {
                        valid = false;
                    } else {
                      adj = +adj;
                      const price = +self.model.get('orders')[key].price;
                      const num = +self.model.get('orders')[key].num;
                      if (price * num + adj < 0) {
                        errorMsg = '商品改价后价格不能小于0元';
                        elem.addClass('error');
                        valid = false
                      }
                    }

                    var discount = parseInt(elem.attr("data-discount-fee")),
                        part = parseInt(elem.attr("data-part-fee"));
                    adj = toPriceInt(adj);
                    ids.push(elem.attr("data-oid"));
                    fees.push(toPriceStr(adj + part));
                });


                function priceCheck(rsp, target) { // 设置邮费大于1500
                    if (!rsp || typeof rsp.sub_code !== 'string') {
                        return true
                    }
                    var subcode = rsp.sub_code.split('|');
                    if (subcode[0] === 'POST_FEE_CANT_MORE_THAN_UPPER_LIMIT') {
                        var hrefs = {
                            taobao: '//helpcenter.taobao.com/learn/knowledge?version=old&id=20724899&referer=null', // 淘宝
                            tmall:  '//service.tmall.com/support/tmall/knowledge-20724896.htm', // 天猫
                            trip: '//service.alitrip.com/HelpCenterDetail.htm?id=20725082', // 飞猪
                            tmallhk: '//rule.tmall.hk/wh-rule/detail/index?kid=20727207' // 天猫国际
                        };
                        var key = subcode[1];
                        if(hrefs[key] === undefined) {
                            key = 'taobao';
                        }
                        sandbox.emit("showPopup", {content: $('<div style="padding: 10px 0 10px 10px">您设置的邮费金额过高，详情<a href="' + hrefs[key] + '" target="_blank" style="color: #28a3ef; text-decoration: underline; margin-left: 6px;">点击查看</a></div>'), target: target || $('.J_postFee')[0]});
                        return false;
                    }
                    return true;
                }

                if (valid && reg.test(post)) {
                    if (global.fromTaobao) {
                        QN.application.invoke({
                            cmd:"updateTradePrice",
                            //QN.top.invoke({
                            //"cmd": "taobao.trade.price.update",
                            param: {
                                update: JSON.stringify({
                                    tid: this.model.get('tid'),
                                    oids: ids.join(","),
                                    adjust_fees: fees.join(","),
                                    postage_fee: toPriceStr(toPriceInt(post))
                                })
                            },
                            success: function() {
                                self.model.set("modified", '.');

                                self.model.fetchContent();
                            },
                            error: function(rsp) {
                                priceCheck(rsp, self.$el.find('.J_postFee')[0]);
                                onError(rsp);
                            }
                        });
                    } else {
                        QN.top.invoke({
                            "cmd": "taobao.trade.postage.update",
                            "param": {
                                tid: this.model.get('tid'),
                                post_fee: toPriceStr(toPriceInt(post))
                            }}).done(
                            function(){
                                self.model.set("modified", '.');
                                self.model.fetchContent();
                            }).fail(function(rsp){
                                priceCheck(rsp, self.$el.find('.J_postFee')[0]);
                            })
                    }
                } else {
                    sandbox.emit("toast", errorMsg);
                }
            },
            startQuickEdit: function() {
                this.$el.find('.J_quickForm').show();
            },
            confirmQuickEdit: function() {
                var self = this;
                // 将数字或数字形式的字符串转换为最多2位小数的浮点数，保证精度。
                var toPriceFloat = function(origin) {
                    return parseFloat(parseFloat(origin).toFixed(2));
                };
                var $quickPriceEl = this.$el.find('.J_quickPrice');
                var $postFeeEl = this.$el.find('.J_postFee');
                var quickVal = $quickPriceEl.val().trim();
                var postVal = $postFeeEl.val().trim();
                if (!quickVal || !postVal) {
                    return;
                }
                if (!/^\d+(\.[\d]*)?$/.test(quickVal)) {
                    $quickPriceEl.addClass('error');
                    return;
                }
                if (!/^\d+(\.[\d]*)?$/.test(postVal)) {
                    $postFeeEl.addClass('error');
                    return;
                }
                $quickPriceEl.removeClass('error');
                quickVal = toPriceFloat(quickVal);
                var trade = this.model.toJSON();
                var postFee = toPriceFloat(postVal);

                var filterArr = [];
                for(var i = 0, l = trade.orders.length; i < l; i++){
                    if(trade.orders[i].status !== 'TRADE_CLOSED_BY_TAOBAO'){
                        filterArr.push(trade.orders[i]);
                    }
                }
                trade.orders = filterArr;
                if (global.fromTaobao) {
                    var $priceInputs = this.$el.find('.J_price');
                    var quickTotalFee;
                    if (quickVal <= postFee) {
                        quickTotalFee = quickVal;
                        $postFeeEl.val(0);
                    } else {
                        quickTotalFee = toPriceFloat(quickVal - postFee);
                    }
                    self.$el.find('.J_discount').val('');
                    var remainFee = quickTotalFee;
                    var actualTradeFee = toPriceFloat(trade.payment - trade.post_fee); // 实际商品总金额
                    $priceInputs.slice(0, $priceInputs.length - 1).each(function(i) {
                        var quickFee = toPriceFloat(quickTotalFee * trade.orders[i].total_fee / actualTradeFee);
                        quickFee = quickFee <= 0 ? 0.01 : quickFee;
                        remainFee -= quickFee;
                        $(this).val((quickFee - trade.orders[i].total_price).toFixed(2));
                    });
                    $priceInputs.last().val((remainFee - trade.orders[trade.orders.length - 1].total_price).toFixed(2));
                } else {
                    var itemsPay = toPriceFloat(this.model.get('payment') - this.model.get('post_fee'));
                    if (quickVal < itemsPay) {
                        $quickPriceEl.addClass('error');
                        return;
                    }
                    $postFeeEl.val(toPriceFloat(quickVal - itemsPay));
                }
                self.refreshTotal();
            },
            showAddress: function(e) {
                var self = this, addressView = self.addressView;
                if (!addressView) {
                    addressView = self.addressView = new AddressView({model: (new Backbone.Model(self.model.get("address")))});
                    self.listenTo(self.model, "refreshContent", function(){
                        addressView.model.set(self.model.get("address"));
                    });
                    self.listenTo(addressView, "update", function(){
                        self.model.fetchContent();
                    });
                } else {
                    self.addressView.model.set(
                        _.extend({eidting: false, editable: self.model.get("status") == "WAIT_SELLER_SEND_GOODS"},
                            self.model.get("address")));
                }
                sandbox.emit("showPopup", {content:self.addressView.render().el, target: e.currentTarget});
                self.addressView.delegateEvents();
            },
            closeTrade: function(e) {
                var self = this, closeView = self.closeView;
                if (!closeView) {
                    closeView = self.closeView = new CloseTradeView({model: {tid:this.model, trade: this}});
                    self.listenTo(closeView, "update", function(){
                        self.model.set("modified",".");
                        self.model.fetch();
                    });
                }
                sandbox.emit("showPopup", {content:self.closeView.render().el, target: e.currentTarget});
                self.closeView.delegateEvents();
            },
            showMsg: function(e) {
                sandbox.emit("showPopup", {content:this.msgTmpl(this.model.toJSON()), target: e.currentTarget});
            },
            showMsgTip: function(e) {
                sandbox.emit("showTip", {content:this.msgTmpl(this.model.toJSON()), target: e.currentTarget});
            },
            hideTip: function() {
                sandbox.emit("hideTip");
            },
            showMemo: function(e) {
                var self = this, memoView = self.memoView;
                if (!memoView) {
                    memoView = self.memoView = new MemoView({model: new Backbone.Model(_.pick(self.model.toJSON(),"seller_memo", "seller_flag", "tid"))});
                    self.listenTo(memoView, "update", function(data){
                        self.model.set(data);
                        self.memoView.model.set(_.pick(self.model.toJSON(),"seller_memo", "seller_flag", "tid"));
                        self.renderContent();
                    });
                } else {
                    self.memoView.model.set(_.pick(self.model.toJSON(),"seller_memo", "seller_flag", "tid"));
                }
                sandbox.emit("showPopup", {content:self.memoView.render().el, target: e.currentTarget});
                self.memoView.delegateEvents();
            },
            showMemoTip: function(e) {
                sandbox.emit("showTip", {content:this.memoTipTmpl(this.model.toJSON()), target: e.currentTarget});
            },
            showTraceInfo: function(e) {
                var self = this, traceView = self.traceView;
                if (!traceView) {
                    traceView = self.traceView = new TraceView({model: new TraceModel({
                        tid: self.model.get("tid"),
                        seller_nick: self.model.get("seller_nick")
                    })});
                }
                sandbox.emit("showPopup", {content:traceView.render().el, target: e.currentTarget});
                self.traceView.delegateEvents();
            },
            openTradePlugin: function(e) {
                e.stopPropagation();
                QN.application.invoke({
                    cmd: "tradeDetail",
                    param: {
                        tid: this.model.get("tid")
                    },
                    category: "jiaoyiguanli"
                });
            },
            delay: function(e) {
                var self = this, delayView = self.delayView;
                if (!delayView) {
                    delayView = self.delayView =new DelayView({model: new Backbone.Model({tid: this.model.get("tid")})});
                    self.listenTo(delayView, "update", function(){
                        self.model.fetchContent();
                    });
                }
                sandbox.emit("showPopup", {content:this.delayView.render().el, target: e.currentTarget});
                this.delayView.delegateEvents();
            },
            getLink: function(numIid) {
                var def = $.Deferred();
                cache.getUrl(numIid, function(url){
                        def.resolve(url);
                },
                function(){
                    QN.top.invoke({
                        cmd: "taobao.item.get",
                        param: {
                            fields: "detail_url",
                            num_iid: numIid
                        }}).done(function(rsp) {
                            var url =  rsp.item_get_response.item.detail_url;
                            cache.cacheUrl(numIid, url);
                            def.resolve(url);
                        });
                });
                return def;
            },
            sendLink: function(e) {
                this.getLink($(e.currentTarget).attr("data-id")).done(function(url) {
                    sandbox.emit("sendToChat", url + "\n");
                });
            },
            jumpLink: function(e) {
                this.getLink($(e.currentTarget).attr("data-id")).done(function(url) {
                    QN.application.invoke({
                        cmd: 'browserUrl',
                        param: {url: url}
                    });
                });
            },
            goAlipay: function(e) {
                e.preventDefault();
                QN.application.invoke({
                    cmd: 'browserUrl',
                    param: {url:'https://lab.alipay.com/life/payment/fill.htm?taobaonick=' + this.model.get("seller_nick") + '&optEmail=' + this.model.get("buyer_alipay_no") + ''}
                });
            },
            sendSku: function(e) {
                var elem = $(e.currentTarget);
                sandbox.emit("sendToChat", elem.attr("data-sku"));
            },
            urge: function(e){
                global.phrases.setTid(this.model.get("tid"));
                sandbox.emit("showPopup", {content:global.phrases.el, target: e.currentTarget});
                global.phrases.delegateEvents();
                global.phrases.phraseViews.forEach(function(view) {
                    view.delegateEvents();
                });
            },
            priceUpdate: function(e) {
                var self = this,
                    elem = $(e.currentTarget);
                elem.siblings(".J_discount").val("");
                self.refreshTotal();
            },
            discountUpdate: function(e) {
                var self = this,
                    elem = $(e.currentTarget),
                    val = parseFloat(elem.val()),
                    price = elem.siblings(".J_price");

                if(isNaN(val) || val > 10) {
                    elem.val("");
                    return;
                }
                price.val('-' + toPriceStr(toPriceInt(parseFloat(price.attr("data-total-price")) * (10 -  val) / 10)));
                self.refreshTotal();
            },
            postFeeUpdate: function(e) {
                var self = this,
                    elem = this.$el.find('.J_postFee'),
                    val = elem.val();
                if (!self.priceReg.test(val) || toPriceInt(val) < 0) {
                    elem.addClass("error");
                    return;
                }
                elem.removeClass("error");
                self.refreshTotal();
            },
            refreshTotal: function() {
                var self = this,
                    total =  _.reduce(_.map(self.$(".J_price"), function(el) {
                        var elem = $(el),
                            val = elem.val();
                        if (self.priceReg.test(val)){
                            var itemPrice = (toPriceInt(elem.attr("data-total-price")) + toPriceInt(val));
                            if (itemPrice >= 0) {
                                elem.removeClass("error");
                                return itemPrice;
                            } else {
                                elem.addClass("error");
                                return NaN;
                            }
                        } else {
                            elem.addClass("error");
                            return NaN;
                        }
                    }), function(memo, num){
                        return isNaN(memo) || isNaN(num) ? NaN : memo + num;
                    }, toPriceInt(self.$(".J_postFee").val()));
                if(!global.fromTaobao) {
                    total = toPriceInt(this.model.get('payment')) - toPriceInt(this.model.get('post_fee')) + toPriceInt(self.$(".J_postFee").val());
                }

                if (!isNaN(total)) {
                    self.$(".J_payment").html(toPriceStr(total));
                }
            }
        })
    );

    var AddressView = Backbone.View.extend({
        model: Backbone.Model,
        className: "address",
        template : template.compile($("#J_addressTmpl").html()),
        sendTmpl: template.compile($("#J_sendAddrTmpl").html()),
        events: {
            "click .J_modifyAddress": "startEdit",
            "click .J_cancelAddress": "cancelEdit",
            "click .J_saveAddress": "saveEdit",
            "click .J_sandAddress": "sendAddress"
        },
        startEdit: function(e){
            e.preventDefault();
            this.model.set("editing", true);
        },
        cancelEdit: function(e) {
            e.preventDefault();
            this.model.set("editing", true);
        },
        saveEdit: function(e) {
            e.preventDefault();
            var self = this;
            var param = {
                tid: this.model.get('tid'),
                receiver_name: this.$(".J_rName").val(),
                receiver_phone: this.$(".J_rPhone").val(),
                receiver_mobile: this.$(".J_rMobile").val(),
                receiver_state: this.$(".J_rState > option:selected").text(),
                receiver_city: this.$(".J_rCity > option:selected").text(),
                receiver_district: this.$(".J_rDist > option:selected").text(),
                receiver_address: this.$(".J_rAddress").val(),
                receiver_zip: this.$(".J_rZip").val()
            };

            QN.top.invoke({
                cmd: "taobao.trade.shippingaddress.update",
                param: param
            }).done(function(){
                    self.trigger("update");
                });
        },
        sendAddress: function() {
            sandbox.emit("sendToChat", this.sendTmpl(this.model.toJSON()));
            sandbox.emit("hidePopup");
        },
        initialize: function() {
            var self = this;
            this.listenTo(this.model, 'change', function(){setTimeout(function(){
                self.render()
            }, 2)});
        },
        render: function() {
            this.$el.html(this.template(this.model.toJSON()));
            if (this.model.get("editing")) {
                var select = this.$(".J_regionSelect");
                select.SppRegionSelect();
                $("select", select).each(function(i, e){
                    var elem = $(e);
                    elem.val($('option:contains(' + elem.attr("data-default") + ')', elem).val());
                    elem.change();
                });
            }
            return this;
        }
    });

    var MemoView = Backbone.View.extend({
        template: template.compile($("#J_memoTmpl").html()),
        events : {
            "click .J_updateMemo": "updateMemo"
        },
        updateMemo: function() {
            var self = this,
                memo = this.$(".J_memoContent").val(),
                flag =  this.$('.J_flag:checked').val() || 0,
                def;

            if (memo == null ) {
                def = QN.top.invoke({
                    "cmd": "taobao.trade.memo.add",
                    "param": {
                        "tid": this.model.get("tid"),
                        "memo": memo,
                        "flag": flag
                    }});
            } else {
                def = QN.top.invoke({
                    "cmd": "taobao.trade.memo.update",
                    "param": {
                        "tid": this.model.get("tid"),
                        "flag": flag,
                        "memo": memo,
                        "reset": !memo
                    }});
            }

            def.done(function(){
                self.trigger("update", {seller_memo: memo, seller_flag: flag});
                sandbox.emit("hidePopup");
            }).fail(onError);

        },
        initialize: function() {
            this.render();
        },
        render: function() {
            var self = this;
            this.$el.html(this.template(this.model.toJSON()));
            QN.application.invoke({
                cmd: 'getFocus',
                success: function() {
                    self.$el.find('.J_memoContent').focus();
                }
            });
            return this;
        }
    });

    var DelayView = Backbone.View.extend({
        template: template.compile($("#J_delayTmpl").html()),
        events: {
            "click .J_doDelay" : "doDelay"
        },
        doDelay: function() {
            var self = this, days = $('[name="days"]:checked').val();
            QN.top.invoke({
                cmd: "taobao.trade.receivetime.delay",
                param: {
                    tid: this.model.get('tid'),
                    days: days
                }}).done(function() {
                    self.trigger("update");
                    sandbox.emit("hidePopup");
                    sandbox.emit("toast", "延长成功");
                });
        },
        render: function(){
            this.$el.html(this.template({}));
            return this;
        }
    });
    /*
    var RefuseView = Backbone.View.extend({
        template: template.compile($('#J_refuseTmpl').html()),
        events: {
            "click .J_doRefuse": "doRefuse"
        },
        doRefuse: function() {
            var reason = $(".J_refuseReason").val(),
                self = this;
            QN.top.invoke({
                cmd: "taobao.refund.refuse",
                param: {
                    "refund_id": this.model.refund_id,
                    "tid": this.model.tid,
                    "oid": this.model.oid,
                    refuse_message: reason
                },
                success: function() {
                    sandbox.emit("hidePopup");
                    sandbox.emit("refuseSuccess",  self.model.get('oid'));
                },
                error: function(rsp) {
                    sandbox.emit("toast", rsp.sub_msg || "系统繁忙，请稍后再试");
                    global.debug && sandbox.emit("toast", JSON.stringify(rsp));
                }
            });
        },
        initialize: function() {

        },
        render: function() {
            this.$el.html(this.template({}))
            return this;
        }
    });

    */

    var TraceModel = Backbone.Model.extend({
        fetch: function () {
            var self = this;
            QN.top.invoke({
                cmd: "taobao.logistics.trace.search",
                param: {
                    tid: this.get("tid"),
                    seller_nick: this.get("seller_nick")
                }}).done(function(rsp) {
                    self.set(_.extend(rsp.logistics_trace_search_response, {inited: true}));
                });
        },
        initialize: function() {
            this.set('inited', false);
            this.fetch();
        }
    });

    var TraceView = Backbone.View.extend({
        traceTmpl: template.compile($("#J_traceTmpl").html()),
        sendTraceTmpl: template.compile($("#J_sendTraceTmpl").html()),
        events: {
            "click .J_sendTrace": "sendTrace"
        },
        sendTrace: function(){
            sandbox.emit("sendToChat", this.traceText);
        },
        initialize: function() {
            this.listenTo(this.model, "change", this.render);
        },
        render: function() {
            this.$el.html(this.traceTmpl(this.model.toJSON()));
            if (this.model.get("out_sid")) {
                this.traceText = this.sendTraceTmpl(this.model.toJSON());
            }
            return this;
        }
    });

    var CloseTradeView = Backbone.View.extend({
        tagName: 'div',
        className: 'close-trade',
        template: template.compile($('#J_closeTradeTmpl').html()),
        events: {
            "click .J_doCloseTrade": "closeTrade",
            "click .J_close_checkAll": "checkAll",
            "click .close-trade-checkbox": "checkStateHandler"
        },
        
        closeTrade: function() {
            var self = this,
                orders = self.getItem(),
                index = 0,
                len = orders.length;

            if( len !== 0 ){
                invoke(orders[index++]);
            }

            function invoke(tid){
                QN.top.invoke({
                "cmd": "taobao.trade.close",
                "param": {
                    "tid": tid,
                    "close_reason": $('.close-trade-select').val()
                }}).done(function() {
                    sandbox.emit("hidePopup");
                    self.trigger("update");
                    if(index < len){
                        invoke(orders[index++]);
                    }
                });
            }
        },
        checkStateHandler: function(){
            var status = true,
                checkboxs = $('.close-trade-checkbox'),
                checkall = $('.J_close_checkAll');
            for(var i = 0, l = checkboxs.length; i < l; i++){
                if(!checkboxs[i].checked){
                    checkall[0].checked = false;
                    status = false;
                    break;
                }
            }
            if(status){
                checkall[0].checked = true;
            }
        },
        getItem: function(){
            var value = [],
                checkboxs = $('.close-trade-checkbox'),
                checkall = $('.J_close_checkAll');
            if(checkall[0].checked){
                value.push(this.model.tid.attributes.tid);
            }else{
                for(var i = 0, l = checkboxs.length; i < l; i++){
                    if(checkboxs[i].checked){
                        value.push(checkboxs[i].getAttribute('oid'));
                    }
                }
            }
            return value;
        },
        checkAll: function(event){
            if(event.currentTarget.checked)
                $('.close-trade-checkbox').prop('checked', true);
            else
                $('.close-trade-checkbox').prop('checked', false);
        },
        initialize: function() {
            this.render();
        },
        dataFilter: function(){
            var orders = [];
            _.each(this.model.tid.attributes.orders, function(curr, key){
                if(curr.status !== 'TRADE_CLOSED_BY_TAOBAO'){
                    orders.push(curr);
                }
            })
            this.model.tid.attributes.orders = orders;
        },
        render: function() {
            this.dataFilter();
            this.$el.html(this.template(this.model));
            return this;
        }
    });


    //旺旺催付模块
    var PhraseView = Backbone.View.extend({
        className: "phrase-wrap",
        template: template.compile($("#J_phraseTmpl").html()),
        events: {
            "click .J_phrase": "sendPhrase",
            "click .J_delete": "delPhrase",
            "click .J_modify": "edit",
            "click .J_done": "done",
            "click .J_cancle": "cancle"
        },
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'destroy', this.remove);
        },
        render: function() {
            this.$el.html(this.template(this.model.toJSON()));
            this.input = this.$(".J_editArea");
            return this;
        },
        sendPhrase: function() {
            sandbox.emit("sendToChat", this.model.get("phraseContent") + "\n详情链接:http://trade.taobao.com/trade/detail/trade_item_detail.htm?bizOrderId=" + this.model.tid);
        },
        delPhrase: function(e) {
            e.stopPropagation();
            this.model.destroy();
        },
        edit: function() {
            this.$el.addClass("modify-phrase");
            this.input.focus();
        },
        done: function(e) {
            e.stopPropagation();
            this.model.save({phraseContent: this.input.val()});
            this.$el.removeClass("modify-phrase");
        },
        cancle: function(e) {
            e.stopPropagation();
            this.$el.removeClass("modify-phrase");
            this.render();
        }
    });

    var PhraseList = Backbone.Collection.extend({
        localStorage: new Backbone.LocalStorage("ww-phrase")
    });

    var PhraseListView = Backbone.View.extend({
        className: "pop-body phrase-list",
        initialize: function(){
            this.phrases = new PhraseList();
            this.phraseViews = [];
            this.listenTo(this.phrases, "add", this.addOne);
            this.listenTo(this.phrases, "reset", this.addAll);

            this.phrases.fetch();
            if (this.phrases.length == 0) {
                this.phrases.reset([
                    {phraseContent: "亲，您在本店购买的宝贝还没有付款哦，付款后我们会尽快为您安排发货哦~"},
                    {phraseContent: "亲，您拍下的订单我们一直留着，为了保证顺利发货，麻烦付款一下哦~"},
                    {phraseContent: "亲，您拍下的订单还没有付款，麻烦尽快付款。"}
                ]);
                this.phrases.each(function(e){
                    e.save();
                });
            }
        },
        setTid: function(tid) {
            this.phrases.each(function(e){
                e.tid = tid;
            });
        },
        addOne: function(phrase) {
            var view = new PhraseView({model: phrase});
            this.phraseViews.push(view);
            this.$el.append(view.render().el);
        },
        addAll: function() {
            this.phrases.each(this.addOne, this);
        }

    });

    var tradeList = new (Backbone.Collection.extend({
        model: TradeModel,
        initialize: function() {
            this.listenTo(this, "reset", function(models, options){
                _.each(options.previousModels, function(e){
                    e.destroy();
                });
            });
        }
    }));

    var TradeListView = Backbone.View.extend({
        el: $("#J_tradeList"),
        subViews: [],
        events: {
            "click .J_dropBox": "toggleDropBox"
        },
        toggleDropBox: function(e) {
            var elem = $(e.target);
            var current = $(e.currentTarget);
            if (elem.is(".J_toggleFixed") || elem.parents(".J_toggleFixed").length > 0) {
                if (current.is(".fixed")) {
                    current.removeClass("fixed").addClass("extend");
                } else if (current.is(".extend")) {
                    current.removeClass("extend").addClass("fixed");
                } else {
                    current.removeClass("fixed").addClass("extend");
                }
            }
        },
        initialize: function() {
            this.listenTo(tradeList, "reset", this.refresh);
            this.listenTo(tradeList, "add", this.prepend);
        },
        append: function(elem) {
            var view = new TradeView({model: elem});
            this.subViews.push(view);
            this.$el.append(view.el);
        },
        prepend: function(elem) {
            var view = new TradeView({model: elem});
            this.subViews.unshift(view);
            this.$el.prepend(view.el);
        },
        refresh: function() {
            var self = this;
            self.subViews = [];
            _.each(tradeList.models, function(elem) {
                self.append(elem);
            });
        }
    });

    return {
        init: function(){
            function getTradeBaseInfo(tid) {
                var def = $.Deferred();
                QN.top.invoke({
                    cmd: "taobao.trade.get",
                    param: {
                        fields: global.trade_fields,
                        tid: tid
                    }}).done(function(rsp){
                        def.resolve(rsp.trade_get_response.trade);
                    });
                return def;
            }
            global.views.tradeListView = new TradeListView();
            global.phrases = new PhraseListView();

            sandbox.on('tabChanged', function() {
                tradeList.reset();
            });
            sandbox.on("updateTradeList", function(data){
                if (global.querySequence == data.qs)
                    tradeList.reset(data.list);
            });
            sandbox.on("addTrade", function(tid){
                getTradeBaseInfo(tid).done(function(trade){
                    tradeList.add(trade);
                })
            });
            sandbox.on("updateTradeData", function(tid){
                getTradeBaseInfo(tid).done(function(trade){
                    var oldTrade = tradeList.find(function(t){
                        return t.get("tid") == tid;
                    });
                    oldTrade.set(trade);
                    oldTrade.fetch();
                });
            });


        }
    }
};/**
 * Created with JetBrains WebStorm.
 * User: cangya.jyt
 * Date: 13-11-20
 * Time: 下午1:33
 * To change this template use File | Settings | File Templates.
 */

var TabModule = function(sandbox) {

    var __tabId__ = "",
        __lastTime__ = 0;

    function updateTrades(tradeList, status, theSequence) {
        if (status[0] != "") {
            tradeList = _.filter(tradeList, function(elem){
                return status.indexOf(elem.status) != -1;
            });
        }
        sandbox.emit("updateTradeList", {list:tradeList, qs: theSequence});
    }

    function getStatus(tabId) {
        switch(tabId) {
            case "J_all":
                return [""];
            case "J_active":
                return ["WAIT_BUYER_PAY", "WAIT_SELLER_SEND_GOODS", "SELLER_CONSIGNED_PART", "WAIT_BUYER_CONFIRM_GOODS", "TRADE_BUYER_SIGNED"];
            case "J_done":
                return ["TRADE_FINISHED"];
            case "J_exceptional":
                return ["TRADE_CLOSED", "TRADE_CLOSED", "TRADE_CLOSED_BY_TAOBAO"]
        }
    }

    return {
        init: function(){
            sandbox.on("tabChanged", function(tabId){
                /* 防止用户点击过快 */
                sandbox.emit("hidePopup");
                if (__tabId__ == tabId && (new Date()).getTime() - __lastTime__ < 500 && !global.userRefreshed) {
                        return;
                }
                global.userRefreshed = false;
                __tabId__ = tabId || __tabId__;
                tabId = __tabId__;
                __lastTime__ = (new Date()).getTime();
                /* end */

                var status = getStatus(tabId),
                    theSequence = ++(global.querySequence),
                    param = {
                        fields: global.trade_fields,
                        buyer_nick: global.buyer_nick,
                        type: global.tradeTypes.join(','),
                        page_no: 1,
                        page_size: 100,
                        use_has_next: true
                    };

                $("#" + tabId).addClass("active").siblings().removeClass("active");

                QN.top.invoke({
                    cmd: "taobao.trades.sold.get",
                    param: param
                }).done(function(rsp) {
                    console.log('taobao.trades.sold.get', JSON.parse(JSON.stringify(rsp)));
                    rsp = rsp.trades_sold_get_response;
                        rsp.trades = rsp.trades || {};
                        rsp.trades.trade = rsp.trades.trade || [];
                        if (rsp.trades.trade.length > 0) {
                            var tradeList = rsp.trades.trade;
                            updateTrades(tradeList, status, theSequence);
                        } else {
                            updateTrades([], status, theSequence);
                        }
                    });
            });

            var tabEl = $(".J_tradeTab");

            tabEl.delegate("li", "click", function(e){
                e.preventDefault();
                sandbox.emit("tabChanged", $(e.currentTarget).attr("id"));
            });

        }
    }
};
var sdkversion = 0;
var ApiForNativeModule = function(sandbox) {
    var TradeGetter = {

        fields: 'tid,seller_nick,created,pic_path,title,receiver_state,receiver_city,receiver_district,receiver_address,receiver_zip,receiver_name,receiver_mobile,receiver_phone,status',
        status: {
            unfinished: ['WAIT_BUYER_PAY', 'WAIT_SELLER_SEND_GOODS', 'SELLER_CONSIGNED_PART', 'WAIT_BUYER_CONFIRM_GOODS', 'TRADE_BUYER_SIGNED'],
            waitPay: ['WAIT_BUYER_PAY'],
            waitComfirm: ['WAIT_BUYER_CONFIRM_GOODS']
        },

        getUnfinished: function(param) {
            var self = this, d = $.Deferred();
            this._get(param.chatNick.substr(8)).done(function(trades) {
                trades = self._filter(trades, self.status.unfinished, param.tid);
                self._selectTrade(trades, d, param);
            });
            return d;
        },

        getWaitPay: function(param) {
            var self = this, d = $.Deferred();
            this._get(param.chatNick.substr(8)).done(function(trades) {
                trades = self._filter(trades, self.status.waitPay);
                self._selectTrade(trades, d, param);
            });
            return d;
        },

        getWaitComfirm: function(param) {
            var self = this, d = $.Deferred();
            this._get(param.chatNick.substr(8)).done(function(trades) {
                trades = self._filter(trades, self.status.waitComfirm);
                self._selectTrade(trades, d, param);
            });
            return d;
        },

        _get: function(chatNick) {
            var self = this, d = $.Deferred();
            QN.top.invoke({
                cmd: 'taobao.trades.sold.get',
                param: {
                    fields: self.fields,
                    buyer_nick: chatNick,
                    type: global.tradeTypes.join(','),
                    page_no: 1,
                    page_size: 100,
                    use_has_next: true
                }
            }).done(function(rsp) {
                rsp = rsp.trades_sold_get_response;
                rsp.trades = rsp.trades || {};
                rsp.trades.trade = rsp.trades.trade || [];
                if (rsp.trades.trade.length < 1) {
                    self._noTrade();
                    return;
                }
                d.resolve(rsp.trades.trade);
            }).fail(function() {
                QN.setResponse({
                    msg: '订单查询接口调用失败',
                    status: 'error',
                });
                sandbox.emit('toast', '订单查询接口调用失败');
            });
            return d;
        },

        _filter: function(trades, status, tid) {
            var filter = tid ?
                    function(t) {return t.tid == tid;} :
                    function(t) {return status.indexOf(t.status) >= 0;};
            return _.filter(trades, filter);
        },

        _selectTrade: function(trades, dfd, param) {
            var self = this;
            if (trades.length === 0) {
                self._noTrade();
            } else if (trades.length === 1) {
                dfd.resolve(trades[0]);
            } else {

                // 低于107005的客户端版本，selectOrder协议不支持string类型，需要强制转换为number
                if(Number(sdkversion) < 107005){
                    trades.forEach(function(trade) {
                        trade.tid = Number(trade.tid);
                    })
                }else{
                    // 高于107005，客户端只接收string类型的tid，需强制转换为string
                    trades.forEach(function(trade) {
                        trade.tid = String(trade.tid);
                    })
                }

                QN.application.invoke({
                    cmd: 'selectOrder',
                    param: {
                        uuid: param.chatNick,
                        chatNick: param.chatNick.substr(8),
                        hotkey: param.hotkey,
                        tradeList: JSON.stringify(trades)
                    },
                    success: function(rsp) {
                        dfd.resolve(_.findWhere(trades, {tid: rsp.tid}));
                    },
                    error: function(msg) {
                        // QN.plugin.errorResponse(msg);
                        // sandbox.emit('toast', '选择订单失败');
                        dfd.resolve(trades[0]);
                    }
                });
            }
        },

        _noTrade: function() {
                QN.setResponse({
                    msg: '没有相关的订单',
                    status: 'error'
                });
            sandbox.emit('toast', '没有相关的订单');
        }
    };

    var paramConfig = {
            checkAddress: {
                chatNick: String,
                tid: Number
            },
            // 以下配置未经测试
            // orderRemarks: {
            //     chatNick: String
            // },
            // priceChange: {
            //     chatNick: String
            // },
            // postageFree: {
            //     chatNick: String
            // },
            // checkLogistics: {
            //     chatNick: String
            // }
        };

    var API = {
        // 核对地址：Alt + Q
        checkAddress: function(param) {
            param = JSON.parse(param);
            TradeGetter.getUnfinished(param).done(function(trade) {
                sandbox.emit('sendToChat', {
                    chatNick: param.chatNick.substr(8),
                    text: _.template($('#J_sendAddrTmpl').html(), trade)
                });
                QN.setResponse({
                    msg: '',
                    status: 'success'
                });
            });
        },
        // 订单备注：Alt + W
        orderRemarks: function(param) {
            param = JSON.parse(param);
            TradeGetter.getUnfinished(param).done(function(trade) {
                var view = _.find(global.views.tradeListView.subViews, function(v) {
                    return v.model.get('tid') == trade.tid;
                });
                if (view) {
                    view.$el.find('.J_memo').click();
                    QN.setResponse({
                        msg: '',
                        status: 'success'
                    });
                } else {
                    sandbox.emit('toast', '没有找到对应的订单');
                    QN.setResponse({
                        msg: '没有找到对应的订单',
                        status: 'error'
                    });
                }
            });
        },
        // 改价：Alt + E
        priceChange: function(param) {
            param = JSON.parse(param);
            TradeGetter.getWaitPay(param).done(function(trade) {
                var view = _.find(global.views.tradeListView.subViews, function(v) {
                    return v.model.get('tid') == trade.tid;
                });
                if (view) {
                    view.startEditPrice().focusTo(view.$el.find('.J_price,.J_postFee').eq(0));
                    QN.setResponse({
                        msg: '',
                        status: 'success'
                    });
                } else {
                    sandbox.emit('toast', '没有找到对应的订单');
                    QN.setResponse({
                        msg: '没有找到对应的订单',
                        status: 'error'
                    });
                }
            });
        },
        // 免邮：Alt + R
        postageFree: function(param) {
            param = JSON.parse(param);
            TradeGetter.getWaitPay(param).done(function(trade) {
                var view = _.find(global.views.tradeListView.subViews, function(v) {
                    return v.model.get('tid') == trade.tid;
                });
                if (view) {
                    view.startEditPrice().focusTo(view.$el.find('.J_save'));
                    view.$el.find('.J_postFee').val(0);
                    view.postFeeUpdate();
                    QN.setResponse({
                        msg: '',
                        status: 'success'
                    });
                } else {
                    sandbox.emit('toast', '没有找到对应的订单');
                    QN.setResponse({
                        msg: '没有找到对应的订单',
                        status: 'error'
                    });
                }
            });
        },
        // 发送物流信息：Alt + T
        checkLogistics: function(param) {
            param = JSON.parse(param);
            TradeGetter.getWaitComfirm(param).done(function(trade) {
                QN.top.invoke({
                    cmd: 'taobao.logistics.trace.search',
                    param: {tid: trade.tid, seller_nick: trade.seller_nick}
                }).done(function(rsp) {
                    var tmpl = _.template($('#J_sendTraceTmpl').html());
                    sandbox.emit('sendToChat', tmpl(rsp.logistics_trace_search_response));
                    QN.setResponse({
                        msg: '',
                        status: 'success'
                    });
                });
            });
        }
    };

    return {
        init: function() {
            for (var key in API) {
                if (API.hasOwnProperty(key)) {
                    QN.implement.api({
                        cmd: key,
                        onInvoke: API[key]
                    });
                }
            }

            QN.application.invoke( {
                cmd : 'getSDKVersion',
                error : function(msg, cmd, param) {
                    // 调用失败
                    console.log('获取sdkversion失败', arguments);
                },
                success : function(rsp, cmd, param) {
                    // 回调结果
                    sdkversion = rsp.version;
                }
            });

            var cmd = global.uri.getQueryParamValue('event');
            if (!cmd) return;
            var config = paramConfig[cmd];
            var param = {};
            if (config) {
                _(config).each( function(format, key) {
                    var val = global.uri.getQueryParamValue(key);
                    val && (param[key] = format(val));
                });
                param = JSON.stringify(param);
            } else {
                param = global.uri.getQueryParamValue('param');
            }
            var args = param ? [cmd, param] : [cmd];
            window.onInvokeAPI.apply(window, args);
        }
    };
};
/**
 * Created with JetBrains WebStorm.
 * User: cangya.jyt
 * Date: 13-11-27
 * Time: 下午3:41
 * To change this template use File | Settings | File Templates.
 */
var core = new scaleApp.Core();
window.global = {
    uri: new Uri(decodeURIComponent(location.href)),
    buyer_nick : '',
    querySequence : 0,
    trade_fields: "tid, status, modified, created",
    tradeTypes: ['fixed', 'auction', 'guarantee_trade', 'step', 'independent_simple_trade',
        'independent_shop_trade', 'auto_delivery', 'ec', 'cod', 'game_equipment', 
        'shopex_trade', 'netcn_trade', 'external_trade', 'instant_trade', 'b2c_cod',
        'hotel_trade', 'super_market_trade', 'super_market_cod_trade', 'taohua', 
        'waimai', 'nopaid', 'eticket', 'tmall_i18n', 'insurance_plus', 'finance'],
    views: {}
};
global.buyer_nick = global.uri.getQueryParamValue("chatNick").substr(8);
function initPlugin (){
    QN.setResponse({
        msg: '',
        status: 'success'
    });
    QN.application.invoke({
        cmd: "getShopTitle",
        success: function(rsp) {
            global.fromTaobao = !rsp.get_shop_title_get_response.tmallSeller;
        }
    });
    var invoke = QN.top.invoke;
    global.sn = 0;
    QN.top.invoke = function(config) {
        var def = $.Deferred();
        var sn = global.sn++;
        core.emit("topLoading", sn);
        invoke(_.extend(config, {
            success: function(rsp){
                core.emit("topDone", sn );
                def.resolve.apply(def, arguments);
            },
            error: function(rsp) {
                console.log('调用TOP接口失败', arguments);
                core.emit("topDone", sn);
                core.emit("toast", rsp.sub_msg || "系统繁忙，请稍后再试");
                def.reject.apply(def, arguments);
            }
        }));
        return def;
    }

    core.register("ToastModel", ToastModel);
    core.register("PopupModule", PopupModule);
    core.register("TipModule", TipModule);
    core.register("TabModule", TabModule);
    core.register("TradeModule", TradeModule);
    core.register("LoadingModule", LoadingModule);
    core.register("InputModule", InputModule);
    core.register("ApiForNativeModule", ApiForNativeModule);
    core.start("InputModule");
    core.start("ToastModel");
    core.start("PopupModule");
    core.start("TipModule");
    core.start("TabModule");
    core.start("TradeModule");
    core.start("LoadingModule");
    core.start("ApiForNativeModule");

    core.emit("tabChanged", "J_active");



    QN.event.regEvent({
        eventId: "bench.trade_info",
        notify: function(rsp){
            rsp = JSON.parse(rsp);
            /*
             if (global.resivedList.indexOf(rsp.time) !== -1) {
             return;
             } else {
             global.resivedList.push(rsp.time);
             if (global.resivedList.length > 10) {
             global.resivedList.shift();
             }
             }
             */
            if (rsp.buy_nick == global.buyer_nick) {
                var topic = rsp.subTopic;
                if (topic == "TradeCreate") {
                    core.emit("addTrade", rsp.id);
                } else {
                    core.emit("updateTradeData", rsp.id);
                }

            }
        }
    });

    global.userRefreshed = false;
    QN.event.regEvent({
        eventId: "wangwang.active_contact_changed",
        notify: function(rsp) {
            global.userRefreshed = true;
            var data = JSON.parse(rsp);
            global.buyer_nick = data.newContact.substr(8);
            core.emit("tabChanged", "J_active");
        }
    });

    $('body').keyup(function(e){
        if (e.altKey && e.ctrlKey && e.shiftKey && e.keyCode == 68) {
            global.debug = !global.debug;
            core.emit("toast", global.debug ? "启动调试信息输出" : "关闭调试信息输出");
            cache.clear();
        }
    });

    console.log("debug hook");
}
