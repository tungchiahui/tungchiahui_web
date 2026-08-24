### 1.7.4 IMU案例\(C++\)

#### 1.源文件

功能包cpp04\_imu的src目录下，新建C++文件imu\_tf.cpp，并编辑文件，输入如下内容：

```cpp
/*
    需求：订阅机器人的imu消息，以坐标变换的方式发布机器人相对于其质心在地面投影的姿态。
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建坐标变换广播器；
          3-2.创建imu消息订阅方，在回调函数中解析数据并发布坐标变换。
        4.调用spin函数，并传入g节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/imu.hpp"
#include <tf2_ros/transform_broadcaster.h>
#include <geometry_msgs/msg/transform_stamped.hpp>

using namespace std::placeholders;
// 3.自定义节点类；
class ImuTf: public rclcpp::Node{
public:
    ImuTf():Node("imu_tf_node_cpp"){
        // 3-1.创建坐标变换广播器；
        tf_broadcaster = std::make_unique<tf2_ros::TransformBroadcaster>(*this);
        // 3-2.创建imu消息订阅方，在回调函数中解析数据并发布坐标变换。
        imu_sub = this->create_subscription<sensor_msgs::msg::Imu>("imu",10,std::bind(&ImuTf::imu_cb,this,_1));
    }
private:
    rclcpp::Subscription<sensor_msgs::msg::Imu>::SharedPtr imu_sub; // 订阅imu
    std::unique_ptr<tf2_ros::TransformBroadcaster> tf_broadcaster;
    // imu 回调函数
    void imu_cb(const sensor_msgs::msg::Imu & imu){
        // 组织坐标变换消息
        geometry_msgs::msg::TransformStamped ts;
        ts.header.frame_id = "world";
        ts.header.stamp = this->now();

        ts.child_frame_id = "mycar";

        ts.transform.translation.z = 1.0;
        ts.transform.rotation = imu.orientation;
        // 广播消息
        tf_broadcaster->sendTransform(ts);
    }

};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<ImuTf>());
    // 5.资源释放。
    rclcpp::shutdown();
    return 0;
}
```

#### 2.编辑配置文件

##### 1.packages.xml {#1packagesxml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclcpp</depend>
<depend>sensor_msgs</depend>
<depend>tf2_ros</depend>
<depend>geometry_msgs</depend>
```

##### 2.CMakeLists.txt {#2cmakeliststxt}

CMakeLists.txt 中核心配置如下：

```
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(tf2_ros REQUIRED)
find_package(geometry_msgs REQUIRED)

add_executable(imu_tf src/imu_tf.cpp)
target_include_directories(imu_tf PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>)
target_compile_features(imu_tf PUBLIC c_std_99 cxx_std_17)  # Require C99 and C++17
ament_target_dependencies(
  imu_tf
  "rclcpp"
  "sensor_msgs"
  "tf2_ros"
  "geometry_msgs"
)

install(TARGETS imu_tf
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select cpp04_imu
```

#### 4.执行

请先按照之前介绍，启动机器人底盘以及键盘控制节点。

然后在当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run cpp04_imu imu_tf
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为world，并添加tf插件以显示坐标系相对关系，当机器人姿态发生改变时，rviz2中的坐标系相对关系会随之而改变。

