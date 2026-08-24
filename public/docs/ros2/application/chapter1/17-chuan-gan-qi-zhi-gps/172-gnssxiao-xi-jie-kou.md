## 1.8.2 GNSS消息接口

在ROS2中GNSS消息被封装为了`sensor_msgs/msg/NavSatStatus`接口和`sensor_msgs/msg/NavSatFix`接口，前者用于描述GNSS的信号状态，后者用户描述GNSS的定位信息。

通过指令`ros2 interface show sensor_msgs/msg/NavSatStatus`查看该接口的具体数据结构，结果如下：

```
# 全球导航卫星系统定位状态。
#
# 是否输出增强修复是由修复类型和最后接收到差分校正的时间共同确定的。
# 当状态（status）大于或等于 STATUS_FIX 时，修复是有效的。

int8 STATUS_NO_FIX =  -1        # 没有定位解决方案。
int8 STATUS_FIX =      0        # 有一个有效的定位解决方案。
int8 STATUS_SBAS_FIX = 1        # 使用基于卫星的增强进行定位。
int8 STATUS_GBAS_FIX = 2        # 使用基于地面的增强进行定位。

int8 status #表示定位的状态，采用以上常量值之一

# 定义哪些全球导航卫星系统信号被接收器使用。
uint16 SERVICE_GPS =     1
uint16 SERVICE_GLONASS = 2
uint16 SERVICE_COMPASS = 4      # includes BeiDou.
uint16 SERVICE_GALILEO = 8

uint16 service #表示使用定位服务类型，采用以上常量值之一
```

通过指令`ros2 interface show sensor_msgs/msg/NavSatFix`查看该接口的具体数据结构，结果如下：

```
# 定位信息。
#
# 使用WGS 84参考椭球体进行指定定位数据。

# header.stamp 指定这次测量的ROS时间（相应的卫星时间可以通过sensor_msgs/TimeReference消息报告）。
#
# header.frame_id 是卫星接收器报告的参考框架，通常是天线的位置。这是相对于车辆的欧几里得坐标系，而不是参考地球。

std_msgs/Header header
    builtin_interfaces/Time stamp
        int32 sec
        uint32 nanosec
    string frame_id

# 卫星定位状态信息。
NavSatStatus status
    #
    int8 STATUS_NO_FIX =  -1        #
    int8 STATUS_FIX =      0        #
    int8 STATUS_SBAS_FIX = 1        #
    int8 STATUS_GBAS_FIX = 2        #
    int8 status
    uint16 SERVICE_GPS =     1
    uint16 SERVICE_GLONASS = 2
    uint16 SERVICE_COMPASS = 4      #
    uint16 SERVICE_GALILEO = 8
    uint16 service

# 纬度[度]。正值表示北半球，负值表示南半球。
float64 latitude

# 经度[度]。正值表示本初子午线以东，负值表示本初子午线以西。
float64 longitude

# 高度[米]。正值表示位于WGS 84椭球体以上（若没有可用的高度信息，则为NaN）。
float64 altitude

# 相对于通过报告位置的切平面定义的位置协方差[平方米]。分量按行主序排列，分别是东、北和上（ENU）。
# 注意：这个坐标系在极点处会出现奇点。
float64[9] position_covariance

# 如果固定点的协方差已知，请将其完整填写。
# 如果GPS接收器提供每个测量的方差，请将它们沿对角线设置。
# 如果只有精度衰减可用，请从中估计一个近似的协方差。

uint8 COVARIANCE_TYPE_UNKNOWN = 0           # 未知
uint8 COVARIANCE_TYPE_APPROXIMATED = 1      # 近似
uint8 COVARIANCE_TYPE_DIAGONAL_KNOWN = 2    # 已知对角线
uint8 COVARIANCE_TYPE_KNOWN = 3             # 已知

# 位置协方差矩阵的类型，表示协方差值的解释方式。
uint8 position_covariance_type
```



