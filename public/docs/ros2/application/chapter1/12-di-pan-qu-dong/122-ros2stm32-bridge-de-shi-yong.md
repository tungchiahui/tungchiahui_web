### 1.4.2 里程计消息接口

底盘驱动启动之后，会持续广播一个比较重要的数据——里程计。里程计用于描述当前机器人相对于出发点的位姿以及速度等信息，里程计在机器人定位和导航的局部路径规划中有着重要的作用。在ROS2中里程计消息被封装为了`nav_msgs/msg/Odometry`接口，可通过指令`ros2 interface show nav_msgs/msg/Odometry`查看该接口的具体数据结构，结果如下：

```
# 它描述的是机器人位姿与速度的预估信息。
# 其中位姿信息是以header中的frame_id为参考系的，而速度信息则是以child_frame_id为参考系的。

std_msgs/Header header # 标头
    builtin_interfaces/Time stamp # 时间戳
        int32 sec
        uint32 nanosec
    string frame_id # 位姿信息所参考的坐标系

# 位姿信息所指向的坐标系，也是速度信息所参考的坐标系
string child_frame_id

# 相对于frame_id的预估位姿信息
geometry_msgs/PoseWithCovariance pose
    Pose pose
        Point position # 坐标
            float64 x
            float64 y
            float64 z
        Quaternion orientation # 四元数
            float64 x 0
            float64 y 0
            float64 z 0
            float64 w 1
    float64[36] covariance

# 相对于child_frame_id的预估线速度与角速度
geometry_msgs/TwistWithCovariance twist
    Twist twist
        Vector3  linear # 线速度
            float64 x
            float64 y
            float64 z
        Vector3  angular # 角速度
            float64 x
            float64 y
            float64 z
    float64[36] covariance
```

需要注意的是，里程计在计算时是存在累计误差的，它所描述的是机器人的预估位姿，并不绝对准确。

