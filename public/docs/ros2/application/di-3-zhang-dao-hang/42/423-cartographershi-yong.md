### 4.2.3 slam\_toolbox节点说明

在slam\_toolbox中常用的节点有两个：sync\_slam\_toolbox\_node和async\_slam\_toolbox\_node。

> **sync\_slam\_toolbox\_node：**
>
> 这是一个同步节点，会等待所有传感器数据到达后再处理，确保数据完整性和一致性，提高定位和建图准确性。但同步处理可能导致延迟，更适合对数据一致性和准确性要求高、实时性要求不高的场景。
>
> **async\_slam\_toolbox\_node：**
>
> 与同步节点不同，这是一个异步节点，可以立即处理已接收的数据，减小延迟，提高响应速度。但异步处理可能导致数据不完全同步，定位和建图结果可能不如同步方式准确。因此，它更适合对实时性要求高、对数据一致性和准确性要求相对较低的场景。

在选择使用sync\_slam\_toolbox\_node还是async\_slam\_toolbox\_node时，需根据应用需求和环境权衡。若实时性关键且能接受一定定位或建图误差，选择async\_slam\_toolbox\_node。若对数据一致性和准确性要求较高，且实时性非首要考虑，则选择sync\_slam\_toolbox\_node。另外二者的主要区别在于数据处理的方式，而两个节点发布的话题、订阅的话题、发布的服务以及使用的参数等都是一样的。

#### 1.订阅的话题

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /scan | sensor\_msgs/msg/LaserScan | 来自激光雷达输入的扫描数据 |
| /tf | tf2\_msgs/msg/TFMessage | 配置的`odom_frame`到`base_frame`的转换 |

#### 2.发布的话题

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /map | nav\_msgs/msg/OccupancyGrid | pose-graph（姿态图）在特定的更新频率（map\_update\_interval）下的占用栅格表示。 |
| /pose | geometry\_msgs/msg/PoseWithCovarianceStamped | 配置的`map_frame`中`base_frame`的位姿以及根据扫描匹配计算的协方差 |

#### 3.发布的服务

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /slam\_toolbox/clear\_changes | slam\_toolbox/srv/Clear | 清除所有待处理的手动位姿图操作的更改 |
| /slam\_toolbox/deserialize\_map | slam\_toolbox/srv/DeserializePoseGraph | 从磁盘加载保存的序列化位姿图文件 |
| /slam\_toolbox/dynamic\_map | nav\_msgs/OccupancyGrid | 请求位姿图的当前状态作为占用网格 |
| /slam\_toolbox/manual\_loop\_closure | slam\_toolbox/srv/LoopClosure | 请求对位姿图进行手动更改 |
| /slam\_toolbox/pause\_new\_measurements | slam\_toolbox/srv/Pause | 暂停处理新传入的激光扫描 |
| /slam\_toolbox/save\_map | slam\_toolbox/srv/SaveMap | 保存可用于显示 AMCL 定位的地图图像文件。 |
| /slam\_toolbox/serialize\_map | slam\_toolbox/srv/SerializePoseGraph | 保存地图位姿图和数据，可用于继续建图、slam\_toolbox 定位、离线操作等 |
| /slam\_toolbox/toggle\_interactive\_mode | slam\_toolbox/srv/ToggleInteractive | 在交互模式与非交互模式之间切换，发布节点的交互式标记及其位置，以便在应用程序中进行更新 |
| /slam\_toolbox/reset | slam\_toolbox/srv/Reset | 将当前地图重置回初始状态 |

#### 4.参数

##### 求解器参数

* **solver\_plugin **- 用于 karto 扫描解算器的非线性解算器类型。选项：solver\_plugins::CeresSolver, - solver\_plugins::SpaSolver, solver\_plugins::G2oSolver. Default: solver\_plugins::CeresSolver.

* **ceres\_linear\_solver **- Ceres 使用的线性求解器。选项：SPARSE\_NORMAL\_CHOLESKY、SPARSE\_SCHUR、ITERATIVE\_SCHUR、CGNR。默认为 SPARSE\_NORMAL\_CHOLESKY。

* **ceres\_preconditioner **- 与该求解器一起使用的预处理器。选项：JACOBI、IDENTITY（none）、SCHUR\_JACOBI。默认为JACOBI。

* **ceres\_trust\_strategy **- 信任区域策略。行搜索策略没有公开，因为它们对于这种用途表现不佳。选项：LEVENBERG\_MARQUARDT、DOGLEG。默认值：LEVENBERG\_MARQUARDT。

* **ceres\_dogleg\_type **- 如果信任策略是 DOGLEG，则使用dogleg策略。选项：TRADITIONAL\_DOGLEG、SUBSPACE\_DOGLEG。默认值：TRADITIONAL\_DOGLEG

* **ceres\_loss\_function **- 拒绝异常值的损失函数类型。没有一个等于损失平方。选项：None、HuberLoss、CauchyLoss。默认值：None。

* **mode **- “建图”或“定位”模式，用于 Ceres 问题创建中的性能优化

##### Toolbox参数

* **odom\_frame **- 里程计坐标系

* **map\_frame **- 地图坐标系

* **base\_frame **- 基坐标系

* **scan\_topic **- 扫描主题名， 注意是/scan 不是scan

* **scan\_queue\_size **- 扫描消息对队列长度。在异步模式下应始终设置为 1

* **use\_map\_saver **- 实例化地图服务程序并自行订阅map主题

* **map\_file\_name **- 启动时加载的位姿图文件的名称（如果可用）

* **map\_start\_pose **- 启动建图/定位时的位姿（如果可用）

* **map\_start\_at\_dock **- 在dock（第一个节点）处启动姿势图加载（如果可用）。如果同时设置了pose和dock，优先使用pose

* **debug\_logging **- 更改日志以进行调试

* **throttle\_scans **- 在同步模式下限制的扫描次数

* **transform\_publish\_period **- 里程计odom变换发布周期。 0 不会发布变换。

* **map\_update\_interval **- 更新 2D 占用地图的时间间隔

* **enable\_interactive\_mode **- 是否允许启用交互模式。交互模式将保留映射到其 ID 的激光扫描缓存，以便在交互模式下进行可视化。结果，该进程的内存将会增加。在定位和长期建图模式下可以手动禁用此功能，因为它们会随着时间的推移增加内存利用率。对于建图或连续建图模式均有效。

* **position\_covariance\_scale **- 从扫描匹配发布姿势时缩放位置协方差的量。这可用于调整下游定位滤波器中位姿的影响。协方差表示测量的不确定性，因此扩大协方差将减小位姿对下游滤波器的影响。默认值：1.0

* **yaw\_covariance\_scale **- 从扫描匹配发布位姿时缩放偏航协方差的量。请参阅position\_covariance\_scale 的描述。默认值：1.0

* **resolution **- 生成的 2D 占用图的分辨率

* **max\_laser\_range **- 用于 2D 占用地图光栅化的最大激光范围

* **minimum\_time\_interval **- 在同步模式下处理的扫描之间的最短持续时间

* **transform\_timeout **- 查找转换 TF 超时时间限制

* **tf\_buffer\_duration **- 存储 TF 消息以供查询的时间。如果在同步模式下以倍速脱机运行，则设置高一些。

* **stack\_size\_to\_use **- 将堆栈大小重置为的字节数，以启用文件的序列化/反序列化。自由默认值为 40000000，但越少越好。

* **minimum\_travel\_distance **- 处理新扫描之前的最小行进距离

##### 匹配器参数

* **use\_scan\_matching **- 是否使用扫描匹配来优化里程位姿

* **use\_scan\_barycenter **- 是否使用重心或扫描位姿

* **minimum\_travel\_heading **- 合理更新的最小航向变化

* **scan\_buffer\_size **- 缓冲到链中的扫描次数，也用作定位模式循环缓冲区中的扫描次数

* **scan\_buffer\_maximum\_scan\_distance **- 从缓冲区中删除之前扫描，距离之前位姿的最大距离

* **link\_match\_minimum\_response\_fine **- 精细分辨率通过的阈值链接匹配算法响应

* **link\_scan\_maximum\_distance **- 有效链接扫描之间的最大距离

* **Loop\_search\_maximum\_distance **- 循环闭合时考虑的扫描距离的最大阈值

* **do\_loop\_close **- 是否进行循环闭合（如果不确定，答案是“true”）

* **Loop\_match\_minimum\_chain\_size **- 寻找循环闭合的扫描的最小链长度

* **Loop\_match\_maximum\_variance\_coarse **- 粗略搜索中传递给细化的阈值方差

* **Loop\_match\_minimum\_response\_coarse **- 粗略搜索中环路闭合算法的阈值响应要传递给细化

* **Loop\_match\_minimum\_response\_fine **- 精细搜索中循环闭合算法的阈值响应传递给细化

* **correlation\_search\_space\_dimension**- 搜索网格大小以进行扫描相关性

* **correlation\_search\_space\_resolution **- 搜索网格分辨率以进行扫描相关性

* **correlation\_search\_space\_smear\_deviation **- 用于平滑响应的多模态涂抹量

* **loop\_search\_space\_dimension **- 循环闭合算法的搜索网格的大小

* **loop\_search\_space\_resolution **- 搜索网格分辨率以进行循环闭合

* **loop\_search\_space\_smear\_deviation **- 用于平滑响应的多模态涂抹量

* **distance\_variance\_penalty **- 应用于匹配扫描的惩罚，因为它与里程姿势不同

* **angle\_variance\_penalty **- 应用于匹配扫描的惩罚，因为它与里程姿势不同

* **fine\_search\_angle\_offset **- 用于测试精细扫描匹配的角度范围

* **rough\_search\_angle\_offset **- 用于测试粗略扫描匹配的角度范围

* **coarse\_angle\_resolution **- 在扫描匹配中测试的偏移范围内的角度分辨率

* **minimum\_angle\_penalty **- 确保尺寸不会膨胀的最小惩罚角度

* **minimum\_distance\_penalty **- 扫描可以确保大小不会爆炸的最小惩罚

* **use\_response\_expansion **- 如果没有找到可行的匹配，是否自动增加搜索网格大小



