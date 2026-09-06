### 4.3.5 地图读取节点说明

在`nav2_map_server`中的地图读取节点是`map_server`，该节点相关信息如下。

#### 1.发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| `/map` | `nav_msgs/msg/OccupancyGrid` | 地图数据 |

#### 2.参数

* **frame\_id **- 地图坐标系名称。

* **topic\_name **- 话题名称。

* **yaml\_filename **- 地图数据源。



