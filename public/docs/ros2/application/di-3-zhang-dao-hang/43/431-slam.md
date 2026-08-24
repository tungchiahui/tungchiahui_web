### 4.3.1 地图保存节点说明

在`nav2_map_server`中的地图保存节点是`map_saver_server`，该节点相关信息如下。

#### 1.订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| `/map` | `nav_msgs/msg/OccupancyGrid` | SLAM节点发布的地图数据 |

#### 2.参数

* **save\_map\_timeout **- 保存地图操作的最大等待时间。

* **free\_thresh\_default **- 栅格单元被认为未被占用的概率阈值。

* **occupied\_thresh\_default **- 栅格单元被认为占用的概率阈值。

* **map\_subscribe\_transient\_local **- 节点重启后消息不保留，默认为 true。

#### 3.map\_saver\_cli

另外，而为了便于使用，在`map_saver_server`的基础之上还封装了一个名为`map_saver_cli`的可执行程序，它可以以实参的方式更方便的设置地图保存相关数据，并且后续执行时也是调用`map_saver_cli`，其实参列表如下：

* **-t** 订阅的地图话题。
* **-f** 地图存储路径。
* **--occ** 栅格单元被认为占用的概率阈值。
* **--free** 栅格单元被认为未被占用的概率阈值。
* **--fmt** 图片格式。
* **--mode** 地图模式，trinary\(默认\)或scale或raw。



